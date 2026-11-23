import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { parseEnvironment } from '../../src/config/environment.js';
import { RedisService } from '../../src/platform/redis/redis.service.js';
import { AppLogger } from '../../src/platform/observability/app-logger.js';
import { RedisCallSignals } from '../../src/modules/calling/infrastructure/redis-call-signals.js';
import { CallingConfig } from '../../src/modules/calling/calling.config.js';
import type { SignalGrant } from '../../src/modules/calling/contracts/call-records.js';
// Written only. Actual isolated Redis encryption/ordering/TTL; no DB/job/media assertion.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error('Explicit isolated signal test authorization required');
const app = parseEnvironment(process.env);
if (new URL(app.databaseUrl).pathname !== '/zipp_test')
  throw new Error(
    'Signaling integration requires isolated zipp_test configuration',
  );
const cacheUrl = new URL(app.cacheUrl);
if (
  !(
    cacheUrl.hostname === 'redis-cache' ||
    (['127.0.0.1', 'localhost'].includes(cacheUrl.hostname) &&
      cacheUrl.port === '56382')
  )
)
  throw new Error('Signaling integration requires isolated cache Redis');
describe('M7.4 bounded ephemeral Redis signaling', () => {
  const redis = new RedisService(app, new AppLogger(app)),
    config = new CallingConfig({
      NODE_ENV: 'test',
      AUTH_ENABLED: 'true',
      NOTIFICATIONS_ENABLED: 'true',
      CALLING_ENABLED: 'true',
      CALL_SIGNAL_KEY: '55'.repeat(32),
    }),
    signals = new RedisCallSignals(redis, config),
    keys: string[] = [];
  beforeAll(() => redis.onModuleInit());
  afterAll(async () => {
    try {
      for (const key of keys) await redis.cache.del(key);
    } finally {
      await redis.onModuleDestroy();
    }
  });
  function grant(): SignalGrant {
    const id = randomUUID();
    keys.push(
      `zipp:call-signals:{${id}}:1:CALLER`,
      `zipp:call-signals:{${id}}:1:CALLEE`,
    );
    return {
      callId: id,
      epoch: 1,
      version: 2,
      side: 'CALLER',
      expiresAt: new Date(Date.now() + 30000),
    };
  }
  const key = (g: SignalGrant, side = g.side) =>
    `zipp:call-signals:{${g.callId}}:${g.epoch}:${side}`;
  it('deduplicates simultaneous packets without exposing raw SDP in Redis', async () => {
    const g = grant(),
      packet = {
        messageId: randomUUID(),
        sequence: 1,
        payload: {
          type: 'OFFER' as const,
          sdp: 'private diagnostic SDP/network address',
        },
      };
    const result = await Promise.all([
      signals.send(g, packet),
      signals.send(g, packet),
    ]);
    expect(result).toEqual([{ acceptedSequence: 1 }, { acceptedSequence: 1 }]);
    expect(JSON.stringify(await redis.cache.hgetall(key(g)))).not.toContain(
      packet.payload.sdp,
    );
    const read = await signals.read({ ...g, side: 'CALLEE' }, 0);
    expect(read.items).toEqual([packet]);
    expect((await signals.read(g, 0)).items).toEqual([]);
    expect(await redis.cache.pttl(key(g))).toBeGreaterThan(0);
    expect(await redis.cache.pttl(key(g))).toBeLessThanOrEqual(30000);
  });
  it('rejects changed identities/payloads and skipped sequences', async () => {
    const g = grant(),
      packet = {
        messageId: randomUUID(),
        sequence: 1,
        payload: { type: 'OFFER' as const, sdp: 'opaque' },
      };
    await signals.send(g, packet);
    await expect(
      signals.send(g, {
        ...packet,
        payload: { type: 'OFFER', sdp: 'changed' },
      }),
    ).rejects.toMatchObject({ code: 'SIGNAL_SEQUENCE_CONFLICT' });
    await expect(
      signals.send(g, {
        messageId: randomUUID(),
        sequence: 3,
        payload: {
          type: 'ICE',
          candidate: 'opaque',
          sdpMid: null,
          sdpMLineIndex: 0,
        },
      }),
    ).rejects.toMatchObject({ code: 'SIGNAL_SEQUENCE_CONFLICT' });
    expect((await signals.read({ ...g, side: 'CALLEE' }, 0)).lastSequence).toBe(
      1,
    );
  });
  it('bounds reads, enforces the packet ceiling and treats eviction as resync', async () => {
    const g = grant();
    await signals.send(g, {
      messageId: randomUUID(),
      sequence: 1,
      payload: { type: 'OFFER', sdp: 'opaque' },
    });
    for (let sequence = 2; sequence <= 64; sequence++)
      await signals.send(g, {
        messageId: randomUUID(),
        sequence,
        payload: {
          type: 'ICE',
          candidate: 'opaque',
          sdpMid: null,
          sdpMLineIndex: 0,
        },
      });
    expect(
      (await signals.read({ ...g, side: 'CALLEE' }, 0)).items,
    ).toHaveLength(32);
    await redis.cache.del(key(g));
    expect(
      (await signals.read({ ...g, side: 'CALLEE' }, 1)).resyncRequired,
    ).toBe(true);
    await expect(
      signals.send(g, {
        messageId: randomUUID(),
        sequence: 2,
        payload: {
          type: 'ICE',
          candidate: 'opaque',
          sdpMid: null,
          sdpMLineIndex: 0,
        },
      }),
    ).rejects.toMatchObject({ code: 'SIGNAL_RESYNC_REQUIRED' });
  });
  it('rejects expired writes and tampered/cross-call envelopes without private echo', async () => {
    const g = grant(),
      packet = {
        messageId: randomUUID(),
        sequence: 1,
        payload: { type: 'OFFER' as const, sdp: 'private opaque text' },
      };
    await expect(
      signals.send({ ...g, expiresAt: new Date(0) }, packet),
    ).rejects.toMatchObject({ code: 'CALL_EXPIRED' });
    await signals.send(g, packet);
    const data = await redis.cache.hget(key(g), 'n:1');
    if (!data) throw new Error('Missing signal');
    const other = grant();
    await redis.cache.hset(key(other), 'last', '1', 'n:1', data);
    await expect(
      signals.read({ ...other, side: 'CALLEE' }, 0),
    ).rejects.toMatchObject({ code: 'SIGNAL_UNAVAILABLE' });
    await redis.cache.hset(key(g), 'n:1', 'invalid ciphertext');
    await expect(
      signals.read({ ...g, side: 'CALLEE' }, 0),
    ).rejects.toMatchObject({ code: 'SIGNAL_UNAVAILABLE' });
  });
});
