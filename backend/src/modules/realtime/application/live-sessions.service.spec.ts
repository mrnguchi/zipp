import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import { LiveSessionsService } from './live-sessions.service.js';
import { LiveProjectionService } from './live-projection.service.js';
import { ConnectionLeases } from './connection-leases.port.js';
import type { ConnectionLease } from './connection-leases.port.js';
import type { LivePeer, LiveFailure } from './live-peer.port.js';
import type { LiveSnapshot } from '../contracts/realtime.schemas.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import { RealtimeConfig } from '../realtime.config.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
class Peer implements LivePeer {
  readonly id = randomUUID();
  open = true;
  writable = true;
  frames: LiveSnapshot[] = [];
  failures: LiveFailure[] = [];
  isOpen() {
    return this.open;
  }
  canSend() {
    return this.writable;
  }
  send(s: LiveSnapshot) {
    this.frames.push(s);
  }
  close(e?: LiveFailure) {
    if (e) this.failures.push(e);
    this.open = false;
  }
}
const config = new RealtimeConfig({
  NODE_ENV: 'test',
  REALTIME_ENABLED: 'true',
  AUTH_ENABLED: 'true',
  REALTIME_ALLOW_NATIVE: 'true',
});
describe('M7 live authorization and bounded connection lifecycle (written, not run)', () => {
  let service: LiveSessionsService;
  const id = randomUUID(),
    actor = { userId: randomUUID() },
    input = {
      schemaVersion: 1,
      accessToken: 'a'.repeat(20) + '.' + 'b'.repeat(20) + '.' + 'c'.repeat(20),
      jobType: 'DELIVERY',
      jobId: id,
      afterVersion: 0,
    };
  const initial: LiveSnapshot = {
    schemaVersion: 1,
    type: 'job.snapshot',
    jobType: 'DELIVERY',
    jobId: id,
    version: 2,
    status: 'ASSIGNED',
    custody: 'WITH_SENDER',
    terminal: false,
    position: null,
    resyncRequired: true,
    observedAt: new Date().toISOString(),
  };
  const read =
      jest.fn<(auth: unknown, version: number) => Promise<LiveSnapshot>>(),
    authenticate = jest.fn<(token: string) => Promise<typeof actor>>(),
    acquire =
      jest.fn<(actor: string, ip: string) => Promise<ConnectionLease>>(),
    renew = jest.fn<(lease: ConnectionLease) => Promise<boolean>>(),
    release = jest.fn<(lease: ConnectionLease) => Promise<void>>();
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    read.mockResolvedValue(initial);
    authenticate.mockResolvedValue(actor);
    acquire.mockImplementation((actorKey, ipKey) =>
      Promise.resolve({ id: randomUUID(), actorKey, ipKey }),
    );
    renew.mockResolvedValue(true);
    release.mockResolvedValue();
    const module = await Test.createTestingModule({
      providers: [
        LiveSessionsService,
        { provide: RealtimeConfig, useValue: config },
        {
          provide: LiveProjectionService,
          useValue: {
            identity: {
              authenticate,
              pseudonym: (_p: string, v: string) => `digest-${v}`,
            },
            read,
          },
        },
        { provide: ConnectionLeases, useValue: { acquire, renew, release } },
        {
          provide: RateLimitPort,
          useValue: { consume: () => Promise.resolve() },
        },
      ],
    }).compile();
    service = module.get(LiveSessionsService);
  });
  afterEach(async () => {
    await service.stop();
    jest.useRealTimers();
  });
  it('rejects malformed or extra auth before doing account or projection work', async () => {
    const peer = new Peer();
    await service.connect(peer, { ...input, role: 'ADMIN' }, '127.0.0.1');
    expect(peer.failures[0]?.code).toBe('INVALID_SUBSCRIPTION');
    expect(authenticate).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it('sends only after shared admission and starts with a REST-resync snapshot', async () => {
    const peer = new Peer();
    await service.connect(peer, input, '127.0.0.1');
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(input, 0);
    expect(peer.frames).toEqual([{ ...initial, resyncRequired: true }]);
    expect(peer.frames[0]).not.toHaveProperty('accessToken');
  });
  it('rechecks projection permissions on every tick and closes a revoked stream without leaking details', async () => {
    const peer = new Peer();
    await service.connect(peer, input, '127.0.0.1');
    read.mockRejectedValueOnce(
      new ApiError('INVALID_CREDENTIALS', 401, 'private connection string'),
    );
    await jest.advanceTimersByTimeAsync(3400);
    expect(peer.frames).toHaveLength(1);
    expect(peer.failures.at(-1)).toEqual({
      schemaVersion: 1,
      code: 'UNAUTHENTICATED',
      retryAfterSeconds: 0,
    });
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('denies strangers and releases an acquired lease after feature authorization fails', async () => {
    read.mockRejectedValueOnce(
      new BusinessError('NOT_FOUND', 'private job details'),
    );
    const peer = new Peer();
    await service.connect(peer, input, '127.0.0.1');
    expect(peer.frames).toHaveLength(0);
    expect(peer.failures[0]?.code).toBe('FORBIDDEN');
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('does not read or emit after a shared lease expired or disappeared', async () => {
    const peer = new Peer();
    await service.connect(peer, input, '127.0.0.1');
    renew.mockResolvedValueOnce(false);
    await jest.advanceTimersByTimeAsync(3400);
    expect(read).toHaveBeenCalledTimes(1);
    expect(peer.open).toBe(false);
    expect(peer.failures.at(-1)?.code).toBe('REALTIME_LIMIT');
  });
  it('does not accumulate payloads for a slow consumer', async () => {
    const peer = new Peer();
    await service.connect(peer, input, '127.0.0.1');
    peer.writable = false;
    await jest.advanceTimersByTimeAsync(3400);
    expect(peer.frames).toHaveLength(1);
    expect(peer.failures.at(-1)?.code).toBe('SLOW_CONSUMER');
  });
  it('sends one terminal snapshot and releases transport capacity without any business mutation', async () => {
    const peer = new Peer();
    read.mockResolvedValueOnce({
      ...initial,
      status: 'DELIVERED',
      terminal: true,
      custody: 'WITH_RECIPIENT',
      position: null,
    });
    await service.connect(peer, input, '127.0.0.1');
    await jest.advanceTimersByTimeAsync(20000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(peer.frames).toHaveLength(1);
    expect(peer.open).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('abandons a handshake projection if the peer disconnects before authorization completes', async () => {
    let resolve: ((s: LiveSnapshot) => void) | undefined;
    read.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const peer = new Peer(),
      connecting = service.connect(peer, input, '127.0.0.1');
    await jest.advanceTimersByTimeAsync(0);
    peer.open = false;
    resolve?.(initial);
    await connecting;
    expect(peer.frames).toHaveLength(0);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('fails closed on admission dependency failure', async () => {
    acquire.mockRejectedValueOnce(new Error('private redis URL'));
    const peer = new Peer();
    await service.connect(peer, input, '127.0.0.1');
    expect(read).not.toHaveBeenCalled();
    expect(peer.failures[0]?.code).toBe('REALTIME_UNAVAILABLE');
  });
  it('bounds concurrent initial reads rather than building an unbounded wait queue', async () => {
    const resolves: ((s: LiveSnapshot) => void)[] = [];
    read.mockImplementation(() => new Promise((r) => resolves.push(r)));
    const peers = Array.from({ length: 5 }, () => new Peer()),
      connecting = peers.map((p) => service.connect(p, input, '127.0.0.1'));
    await jest.advanceTimersByTimeAsync(0);
    expect(peers[4]?.failures[0]?.code).toBe('REALTIME_LIMIT');
    expect(read).toHaveBeenCalledTimes(4);
    resolves.forEach((r) => r(initial));
    await Promise.all(connecting);
  });
});
