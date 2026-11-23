import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { queueConnection } from '../../src/platform/queues/queue-connection.js';
import { FOUNDATION_QUEUE } from '../../src/platform/queues/foundation-worker.js';

// Fail instead of silently skipping required real-service verification.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
) {
  throw new Error(
    'Use the isolated test Compose project to run integration tests',
  );
}
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test') {
  throw new Error('Integration tests require the dedicated zipp_test database');
}

describe('real foundation services', () => {
  const database = new DatabaseService(config);
  const queue = new Queue(FOUNDATION_QUEUE, {
    connection: queueConnection(config.queueUrl),
  });
  const events = new QueueEvents(FOUNDATION_QUEUE, {
    connection: queueConnection(config.queueUrl),
  });
  const cache = new Redis(config.cacheUrl, {
    lazyConnect: true,
    connectTimeout: 2000,
  });
  beforeAll(async () => {
    await Promise.all([
      database.onModuleInit(),
      cache.connect(),
      events.waitUntilReady(),
    ]);
  });
  afterAll(async () => {
    await Promise.all([
      queue.close(),
      events.close(),
      cache.quit(),
      database.onModuleDestroy(),
    ]);
  });
  it('reads the applied migration through Prisma with the runtime role', async () => {
    await database.ping();
    expect(
      await database.client.platformMetadata.findUnique({
        where: { key: 'foundation' },
      }),
    ).toMatchObject({ value: 'm6' });
  });
  it('prevents runtime schema changes', async () => {
    await expect(
      database.client
        .$executeRaw`CREATE TABLE forbidden_test_table (id integer)`,
    ).rejects.toThrow();
  });
  it('uses an independent Redis cache', async () => {
    const key = `m0-test:${randomUUID()}`;
    await cache.set(key, 'isolated', 'EX', 30);
    expect(await cache.get(key)).toBe('isolated');
    await cache.del(key);
  });
  it('processes a BullMQ probe in the separate worker', async () => {
    const job = await queue.add(
      'ping',
      {},
      { jobId: randomUUID(), removeOnComplete: 100, removeOnFail: 100 },
    );
    const result: unknown = await job.waitUntilFinished(events, 10000);
    expect(result).toEqual({ status: 'processed' });
    await job.remove();
  });
  it('serves API and worker readiness independently', async () => {
    for (const base of [
      process.env['API_BASE_URL'],
      process.env['WORKER_HEALTH_URL'],
    ]) {
      if (!base) throw new Error('Missing service URL');
      const response = await fetch(`${base}/health/ready`, {
        signal: AbortSignal.timeout(4000),
      });
      expect(response.status).toBe(200);
    }
  });
  it('serves private bounded metrics for both process roles', async () => {
    for (const [base, service] of [
      ['http://api:3002', 'zipp-api'],
      ['http://worker:3001', 'zipp-worker'],
    ]) {
      const response = await fetch(`${base}/metrics`, {
        signal: AbortSignal.timeout(4000),
      });
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain(`service="${service}"`);
      expect(text).toContain('zipp_database_connections');
      expect(text).toContain('zipp_queue_jobs');
      expect(text).not.toContain('local_queue_only');
      expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(
        405,
      );
      expect((await fetch(`${base}/unknown`)).status).toBe(404);
    }
  });
});
