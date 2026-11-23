import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { parseEnvironment } from '../../src/config/environment.js';
import { RedisService } from '../../src/platform/redis/redis.service.js';
import { AppLogger } from '../../src/platform/observability/app-logger.js';
import { RedisConnectionLeases } from '../../src/modules/realtime/infrastructure/redis-connection-leases.js';
import type { ConnectionLease } from '../../src/modules/realtime/application/connection-leases.port.js';
// Written only. Dedicated noeviction queue Redis from isolated zipp_test Compose is required.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error('Explicit isolated realtime service testing required');
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test')
  throw new Error('Realtime integration requires isolated zipp_test');
describe('M7 shared Redis connection admission across independent adapters', () => {
  const redis = new RedisService(config, new AppLogger(config)),
    a = new RedisConnectionLeases(redis),
    b = new RedisConnectionLeases(redis),
    leases: ConnectionLease[] = [];
  beforeAll(() => redis.onModuleInit());
  afterAll(async () => {
    try {
      await Promise.allSettled(leases.map((l) => a.release(l)));
    } finally {
      await redis.onModuleDestroy();
    }
  });
  it('atomically admits only two concurrent connections for one actor across adapters', async () => {
    const actor = randomUUID(),
      ip = randomUUID(),
      results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).acquire(actor, ip)),
      );
    const winners = results.flatMap((r) =>
      r.status === 'fulfilled' ? [r.value] : [],
    );
    leases.push(...winners);
    expect(winners).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(6);
    const first = winners[0];
    if (!first) throw Error('Missing admitted lease');
    await a.release(first);
    const replacement = await b.acquire(actor, ip);
    leases.push(replacement);
    expect(await a.renew(replacement)).toBe(true);
  });
  it('cannot renew an expired lease into a newly admitted slot', async () => {
    const actor = randomUUID(),
      ip = randomUUID(),
      old = await a.acquire(actor, ip);
    leases.push(old);
    const keys = [
      `zipp:{live}:actor:${actor}`,
      `zipp:{live}:ip:${ip}`,
      'zipp:{live}:global',
    ];
    for (const key of keys) await redis.queue.zadd(key, 1, old.id);
    expect(await b.renew(old)).toBe(false);
    const fresh = await a.acquire(actor, ip);
    leases.push(fresh);
    await b.release(old);
    expect(await a.renew(fresh)).toBe(true);
  });
  it('enforces an IP ceiling across different accounts without using forwarded identity', async () => {
    const ip = randomUUID(),
      created: ConnectionLease[] = [];
    for (let i = 0; i < 20; i++)
      created.push(await a.acquire(randomUUID(), ip));
    leases.push(...created);
    await expect(b.acquire(randomUUID(), ip)).rejects.toMatchObject({
      code: 'REALTIME_LIMIT',
    });
  });
});
