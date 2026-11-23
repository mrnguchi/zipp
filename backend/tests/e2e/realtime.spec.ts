import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { LiveServer } from '../../src/modules/realtime/presentation/live-server.js';
import { LiveSessionsService } from '../../src/modules/realtime/application/live-sessions.service.js';
import { LiveProjectionService } from '../../src/modules/realtime/application/live-projection.service.js';
import { ConnectionLeases } from '../../src/modules/realtime/application/connection-leases.port.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import type { Quota } from '../../src/shared/contracts/rate-limit.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { RealtimeConfig } from '../../src/modules/realtime/realtime.config.js';
import { ApiError } from '../../src/shared/errors/api-error.js';
import { BusinessError } from '../../src/shared/errors/business-error.js';
import {
  liveSnapshot,
  liveError,
} from '../../src/modules/realtime/contracts/realtime.schemas.js';
const token = 'a'.repeat(20) + '.' + 'b'.repeat(20) + '.' + 'c'.repeat(20),
  owner = randomUUID(),
  jobId = randomUUID();
// Real socket transport, application/Redis admission doubles. Not native or multi-replica proof.
describe('M7 read-only Socket.IO transport contract (written, not run)', () => {
  let app: NestExpressApplication, url: string;
  const clients: Socket[] = [];
  let holdUpgrades = false;
  const upgradeResolvers: (() => void)[] = [];
  const identity = {
    authenticate: (value: string) =>
      value === token
        ? Promise.resolve({ userId: owner })
        : Promise.reject(
            new ApiError('INVALID_CREDENTIALS', 401, 'private token'),
          ),
    pseudonym: (_p: string, v: string) => v,
  };
  const projection = {
    identity,
    read: async (input: { jobId: string; accessToken: string }) => {
      await identity.authenticate(input.accessToken);
      if (input.jobId !== jobId)
        throw new BusinessError('NOT_FOUND', 'private job');
      return liveSnapshot.parse({
        schemaVersion: 1,
        type: 'job.snapshot',
        jobType: 'DELIVERY',
        jobId,
        version: 1,
        status: 'ASSIGNED',
        custody: 'WITH_SENDER',
        terminal: false,
        position: null,
        resyncRequired: true,
        observedAt: new Date().toISOString(),
      });
    },
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LiveServer,
        LiveSessionsService,
        {
          provide: RealtimeConfig,
          useValue: new RealtimeConfig({
            NODE_ENV: 'test',
            AUTH_ENABLED: 'true',
            REALTIME_ENABLED: 'true',
            REALTIME_ALLOW_NATIVE: 'true',
            REALTIME_ALLOWED_ORIGINS: 'http://localhost:8081',
          }),
        },
        { provide: IdentityFacade, useValue: identity },
        { provide: LiveProjectionService, useValue: projection },
        {
          provide: RateLimitPort,
          useValue: {
            consume: (quotas: readonly Quota[]) => {
              if (
                holdUpgrades &&
                quotas.some((quota) => quota.key.startsWith('live:handshake:'))
              )
                return new Promise<void>((resolve) => {
                  upgradeResolvers.push(resolve);
                });
              return Promise.resolve();
            },
          },
        },
        {
          provide: ConnectionLeases,
          useValue: {
            acquire: (actorKey: string, ipKey: string) =>
              Promise.resolve({ id: randomUUID(), actorKey, ipKey }),
            renew: () => Promise.resolve(true),
            release: () => Promise.resolve(),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => {
    clients.forEach((c) => c.disconnect());
    await app.close();
  });
  function client(
    auth: Record<string, unknown>,
    options: Parameters<typeof io>[1] = {},
  ) {
    const c = io(url, {
      path: '/api/v1/live/socket.io',
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      autoConnect: false,
      auth,
      ...options,
    });
    clients.push(c);
    return c;
  }
  function once(c: Socket, event: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Socket event deadline exceeded')),
        3000,
      );
      c.once(event, (value: unknown) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  }
  const auth = () => ({
    schemaVersion: 1,
    accessToken: token,
    jobType: 'DELIVERY',
    jobId,
    afterVersion: 0,
  });
  it('authorizes a strict handshake and emits a minimal resync projection', async () => {
    const c = client(auth()),
      received = once(c, 'job.snapshot');
    c.connect();
    const frame = liveSnapshot.parse(await received);
    expect(frame.jobId).toBe(jobId);
    expect(frame.resyncRequired).toBe(true);
    expect(frame).not.toHaveProperty('accessToken');
    c.disconnect();
  });
  it('rejects query credentials and a browser origin outside the exact allowlist', async () => {
    for (const options of [
      { query: { token: 'private' } },
      { extraHeaders: { Origin: 'https://attacker.invalid' } },
    ]) {
      const c = client(auth(), options),
        failed = once(c, 'connect_error');
      c.connect();
      await expect(failed).resolves.toBeDefined();
      c.disconnect();
    }
  });
  it('keeps private job IDs and role injection out of subscriptions', async () => {
    const c = client({ ...auth(), jobId: randomUUID() }),
      failed = once(c, 'live.error');
    c.connect();
    expect(liveError.parse(await failed).code).toBe('FORBIDDEN');
    const malicious = client({ ...auth(), roles: ['ADMIN'] }),
      invalid = once(malicious, 'live.error');
    malicious.connect();
    expect(liveError.parse(await invalid).code).toBe('INVALID_SUBSCRIPTION');
  });
  it('does not accept financial or location mutation commands on this stream', async () => {
    const c = client(auth()),
      ready = once(c, 'job.snapshot');
    c.connect();
    await ready;
    const failed = once(c, 'live.error');
    c.emit('location.update', { driverUserId: randomUUID() });
    expect(liveError.parse(await failed).code).toBe('UNSUPPORTED_COMMAND');
  });
  it('does not accept a public delivery capability as a private JWT', async () => {
    const c = client({
        ...auth(),
        accessToken: `${randomUUID()}.${'A'.repeat(43)}`,
      }),
      failed = once(c, 'live.error');
    c.connect();
    expect(liveError.parse(await failed).code).toBe('INVALID_SUBSCRIPTION');
  });
  it('does not expose long-polling as a fallback', async () => {
    const c = client(auth(), { transports: ['polling'] }),
      failed = once(c, 'connect_error');
    c.connect();
    await expect(failed).resolves.toBeDefined();
    c.disconnect();
  });
  it('reserves the raw transport ceiling before asynchronous admission finishes', async () => {
    // Hold the limiter so all accepted upgrades remain pending simultaneously.
    // The next request must fail before JWT/database admission can start.
    holdUpgrades = true;
    const burst: Socket[] = [];
    let deadline: NodeJS.Timeout | undefined;
    try {
      const rejected = new Promise<void>((resolve, reject) => {
        deadline = setTimeout(
          () => reject(new Error('Raw admission rejection deadline exceeded')),
          3000,
        );
        for (let i = 0; i < 65; i++) {
          const c = client(auth());
          burst.push(c);
          c.once('connect_error', () => resolve());
          c.connect();
        }
      });
      await rejected;
      expect(upgradeResolvers).toHaveLength(64);
    } finally {
      clearTimeout(deadline);
      holdUpgrades = false;
      burst.forEach((c) => c.disconnect());
      upgradeResolvers.splice(0).forEach((resolve) => resolve());
    }
  });
});
