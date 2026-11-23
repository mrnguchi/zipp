import { Inject, Injectable } from '@nestjs/common';
import type {
  OnApplicationBootstrap,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Server as HttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { LiveSessionsService } from '../application/live-sessions.service.js';
import { RealtimeConfig } from '../realtime.config.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import type { LiveFailure } from '../application/live-peer.port.js';
import type { LiveSnapshot } from '../contracts/realtime.schemas.js';
type ServerEvents = {
  'job.snapshot': (snapshot: LiveSnapshot) => void;
  'live.error': (error: LiveFailure) => void;
};
type LiveSocket = Socket<Record<string, never>, ServerEvents>;
@Injectable()
export class LiveServer
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private io?: Server<Record<string, never>, ServerEvents>;
  private stopping = false;
  private readonly pendingUpgrades = new Map<IncomingMessage, NodeJS.Timeout>();
  constructor(
    @Inject(HttpAdapterHost) private readonly http: HttpAdapterHost,
    @Inject(LiveSessionsService) private readonly sessions: LiveSessionsService,
    @Inject(RealtimeConfig) private readonly config: RealtimeConfig,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
  ) {}
  onApplicationBootstrap() {
    if (!this.config.enabled) return;
    const server: unknown = this.http.httpAdapter.getHttpServer();
    if (!(server instanceof HttpServer))
      throw new Error('Realtime needs the configured Node HTTP server');
    this.io = new Server(server, {
      path: '/api/v1/live/socket.io',
      transports: ['websocket'],
      allowUpgrades: false,
      serveClient: false,
      maxHttpBufferSize: 8192,
      httpCompression: false,
      perMessageDeflate: false,
      connectTimeout: 5000,
      pingInterval: 10000,
      pingTimeout: 5000,
      allowEIO3: false,
      cors: { origin: [...this.config.origins], credentials: false },
      allowRequest: (req, done) => {
        void this.admit(req)
          .then((ok) => done(null, ok))
          .catch(() => done('Realtime unavailable', false));
      },
    });
    this.io.on('connection', (socket) => this.connected(socket));
    this.io.engine.on('connection', (socket: LiveSocket['conn']) =>
      this.finishUpgrade(socket.request),
    );
  }
  private finishUpgrade(req: IncomingMessage) {
    const timer = this.pendingUpgrades.get(req);
    if (timer) clearTimeout(timer);
    this.pendingUpgrades.delete(req);
  }
  private async admit(req: IncomingMessage) {
    if (this.stopping || !this.config.allows(req.headers.origin)) return false;
    let url: URL;
    try {
      url = new URL(req.url ?? '', 'http://local');
    } catch {
      return false;
    }
    if (
      [...url.searchParams.keys()].some(
        (k) => !['EIO', 'transport', 't', 'b64'].includes(k),
      ) ||
      url.searchParams.get('transport') !== 'websocket' ||
      url.searchParams.get('EIO') !== '4' ||
      (this.io?.engine.clientsCount ?? 0) + this.pendingUpgrades.size >= 64
    )
      return false;
    // Never trust X-Forwarded-For by default. Upgrade ingress is quota-bound before JWT/DB work.
    // Reserve before the asynchronous limiter: simultaneous upgrades cannot all see
    // the same old Engine.IO client count and bypass the unauthenticated ceiling.
    const timer = setTimeout(() => this.finishUpgrade(req), 5000);
    timer.unref();
    this.pendingUpgrades.set(req, timer);
    req.socket.once('close', () => this.finishUpgrade(req));
    try {
      await this.limiter.consume([
        {
          key: `live:handshake:${this.identity.pseudonym('ip', req.socket.remoteAddress ?? 'unknown')}`,
          limit: 30,
          windowMs: 60000,
        },
      ]);
    } catch (e) {
      this.finishUpgrade(req);
      throw e;
    }
    if (this.stopping || !this.pendingUpgrades.has(req)) return false;
    return true;
  }
  private connected(socket: LiveSocket) {
    const raw: unknown = socket.handshake.auth;
    socket.handshake.auth = {};
    const close = (failure?: LiveFailure) => {
      if (socket.connected && failure && socket.conn.transport.writable)
        socket.emit('live.error', failure);
      socket.disconnect(true);
    };
    socket.on('disconnect', () => {
      void this.sessions.disconnect(socket.id);
    });
    socket.onAny(() =>
      close({
        schemaVersion: 1,
        code: 'UNSUPPORTED_COMMAND',
        retryAfterSeconds: 0,
      }),
    );
    void this.sessions
      .connect(
        {
          id: socket.id,
          isOpen: () => socket.connected,
          canSend: () => socket.connected && socket.conn.transport.writable,
          send: (s) => socket.emit('job.snapshot', s),
          close,
        },
        raw,
        socket.handshake.address,
      )
      .catch(() =>
        close({
          schemaVersion: 1,
          code: 'REALTIME_UNAVAILABLE',
          retryAfterSeconds: 5,
        }),
      );
  }
  async beforeApplicationShutdown() {
    this.stopping = true;
    for (const req of this.pendingUpgrades.keys()) this.finishUpgrade(req);
    await this.sessions.stop();
    this.io?.disconnectSockets(true);
    // Detach Engine.IO without closing Nest's shared HTTP listener twice.
    this.io?.engine.close();
  }
}
