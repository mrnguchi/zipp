import { Inject, Injectable } from '@nestjs/common';
import { LiveProjectionService } from './live-projection.service.js';
import { ConnectionLeases } from './connection-leases.port.js';
import type { ConnectionLease } from './connection-leases.port.js';
import type { LivePeer, LiveFailure } from './live-peer.port.js';
import { liveAuth } from '../contracts/realtime.schemas.js';
import type { LiveAuth } from '../contracts/realtime.schemas.js';
import { RealtimeConfig } from '../realtime.config.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
interface Session {
  peer: LivePeer;
  auth: LiveAuth;
  lease: ConnectionLease;
  version: number;
  timer?: NodeJS.Timeout;
}
export function liveFailure(e: unknown): LiveFailure {
  const code =
    e instanceof BusinessError || e instanceof ApiError ? e.code : '';
  if (
    (e instanceof ApiError && e.getStatus() === 401) ||
    ['UNAUTHENTICATED', 'INVALID_CREDENTIALS'].includes(code)
  )
    return { schemaVersion: 1, code: 'UNAUTHENTICATED', retryAfterSeconds: 0 };
  if (
    [
      'NOT_FOUND',
      'FORBIDDEN',
      'ACCOUNT_INACTIVE',
      'RECENT_MFA_REQUIRED',
    ].includes(code)
  )
    return { schemaVersion: 1, code: 'FORBIDDEN', retryAfterSeconds: 0 };
  if (
    code === 'REALTIME_LIMIT' ||
    (e instanceof ApiError && e.getStatus() === 429)
  )
    return { schemaVersion: 1, code: 'REALTIME_LIMIT', retryAfterSeconds: 20 };
  return {
    schemaVersion: 1,
    code: 'REALTIME_UNAVAILABLE',
    retryAfterSeconds: 5,
  };
}
@Injectable()
export class LiveSessionsService {
  private readonly sessions = new Map<string, Session>();
  private pending = 0;
  private reads = 0;
  private stopping = false;
  private readonly operations = new Set<Promise<void>>();
  constructor(
    @Inject(LiveProjectionService)
    private readonly projection: LiveProjectionService,
    @Inject(ConnectionLeases) private readonly leases: ConnectionLeases,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
    @Inject(RealtimeConfig) private readonly config: RealtimeConfig,
  ) {}
  private track(operation: Promise<void>) {
    this.operations.add(operation);
    void operation
      .finally(() => this.operations.delete(operation))
      .catch(() => {});
    return operation;
  }
  connect(peer: LivePeer, raw: unknown, ip: string): Promise<void> {
    return this.track(this.open(peer, raw, ip));
  }
  private async open(peer: LivePeer, raw: unknown, ip: string) {
    if (!this.config.enabled || this.stopping) {
      peer.close(liveFailure(null));
      return;
    }
    const parsed = liveAuth.safeParse(raw);
    if (!parsed.success) {
      peer.close({
        schemaVersion: 1,
        code: 'INVALID_SUBSCRIPTION',
        retryAfterSeconds: 0,
      });
      return;
    }
    if (
      this.pending >= 8 ||
      this.sessions.size + this.pending >= this.config.instanceLimit ||
      this.reads >= this.config.readConcurrency
    ) {
      peer.close({
        schemaVersion: 1,
        code: 'REALTIME_LIMIT',
        retryAfterSeconds: 5,
      });
      return;
    }
    this.pending++;
    this.reads++;
    let lease: ConnectionLease | undefined;
    try {
      const auth = parsed.data,
        identity = this.projection.identity,
        actor = await identity.authenticate(auth.accessToken);
      await this.limiter.consume([
        {
          key: `live:actor:${identity.pseudonym('actor', actor.userId)}`,
          limit: 10,
          windowMs: 60000,
        },
      ]);
      lease = await this.leases.acquire(
        identity.pseudonym('live-actor', actor.userId),
        identity.pseudonym('live-ip', ip),
      );
      const snapshot = await this.projection.read(auth, auth.afterVersion);
      if (!(await this.leases.renew(lease)))
        throw new ApiError('REALTIME_LIMIT', 429, 'Connection lease expired');
      if (!peer.isOpen() || this.stopping) {
        await this.release(lease);
        lease = undefined;
        return;
      }
      if (!peer.canSend()) {
        peer.close({
          schemaVersion: 1,
          code: 'SLOW_CONSUMER',
          retryAfterSeconds: 5,
        });
        await this.release(lease);
        lease = undefined;
        return;
      }
      const session: Session = { peer, auth, lease, version: snapshot.version };
      this.sessions.set(peer.id, session);
      lease = undefined;
      peer.send({ ...snapshot, resyncRequired: true });
      if (snapshot.terminal) {
        peer.close();
        await this.disconnect(peer.id);
      } else this.schedule(session);
    } catch (e) {
      peer.close(liveFailure(e));
      if (lease) await this.release(lease);
      await this.disconnect(peer.id);
    } finally {
      this.pending--;
      this.reads--;
    }
  }
  private schedule(s: Session, delay = this.config.intervalMs) {
    if (this.stopping || this.sessions.get(s.peer.id) !== s) return;
    s.timer = setTimeout(
      () => {
        void this.track(this.tick(s));
      },
      delay + Math.floor(Math.random() * 200),
    );
    s.timer.unref();
  }
  private async tick(s: Session) {
    if (this.stopping || this.sessions.get(s.peer.id) !== s) return;
    if (!s.peer.isOpen()) {
      await this.disconnect(s.peer.id);
      return;
    }
    if (this.reads >= this.config.readConcurrency) {
      this.schedule(s, 250);
      return;
    }
    this.reads++;
    try {
      if (!(await this.leases.renew(s.lease)))
        throw new ApiError('REALTIME_LIMIT', 429, 'Connection lease expired');
      const snapshot = await this.projection.read(s.auth, s.version);
      if (!(await this.leases.renew(s.lease)))
        throw new ApiError('REALTIME_LIMIT', 429, 'Connection lease expired');
      if (
        this.stopping ||
        this.sessions.get(s.peer.id) !== s ||
        !s.peer.isOpen()
      )
        return;
      if (!s.peer.canSend()) {
        s.peer.close({
          schemaVersion: 1,
          code: 'SLOW_CONSUMER',
          retryAfterSeconds: 5,
        });
        await this.disconnect(s.peer.id);
        return;
      }
      // No buffered replay: every emission is a fresh authorized projection. REST owns history.
      s.peer.send(snapshot);
      s.version = snapshot.version;
      if (snapshot.terminal) {
        s.peer.close();
        await this.disconnect(s.peer.id);
      } else this.schedule(s);
    } catch (e) {
      s.peer.close(liveFailure(e));
      await this.disconnect(s.peer.id);
    } finally {
      this.reads--;
    }
  }
  private async release(lease: ConnectionLease) {
    try {
      await this.leases.release(lease);
    } catch {
      /* TTL releases crash/outage orphans; it never releases a business assignment. */
    }
  }
  async disconnect(id: string) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    clearTimeout(s.timer);
    await this.release(s.lease);
  }
  async stop() {
    this.stopping = true;
    const current = [...this.sessions.values()];
    for (const s of current) s.peer.close(liveFailure(null));
    await Promise.allSettled(current.map((s) => this.disconnect(s.peer.id)));
    await Promise.allSettled([...this.operations]);
  }
}
