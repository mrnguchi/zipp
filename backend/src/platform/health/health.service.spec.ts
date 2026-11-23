import 'reflect-metadata';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import { HealthService } from './health.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';

describe('readiness policy', () => {
  const databasePing = jest.fn<() => Promise<void>>();
  const redisPing = jest.fn<() => Promise<void>>();
  let health: HealthService;

  beforeEach(async () => {
    databasePing.mockReset().mockResolvedValue();
    redisPing.mockReset().mockResolvedValue();
    const module = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: DatabaseService,
          useValue: {
            ping: databasePing,
            poolStats: () => ({ total: 0, idle: 0, waiting: 0, max: 5 }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            ping: redisPing,
            queue: { status: 'ready' },
            cache: { status: 'ready' },
          },
        },
        {
          provide: TelemetryService,
          useValue: {
            probe: (_name: string, run: () => Promise<void>) => run(),
            recordPool: () => undefined,
            recordRedis: () => undefined,
          },
        },
      ],
    }).compile();
    health = module.get(HealthService);
  });
  it('requires both database and Redis health', async () => {
    await expect(health.ready()).resolves.toEqual({ status: 'ready' });
    expect(databasePing).toHaveBeenCalledTimes(1);
    expect(redisPing).toHaveBeenCalledTimes(1);
  });
  it('rejects Redis failure even when PostgreSQL responds', async () => {
    redisPing.mockRejectedValue(new Error('unavailable'));
    await expect(health.ready()).rejects.toThrow();
  });
  it('becomes unready while draining even with healthy dependencies', async () => {
    health.beforeApplicationShutdown();
    await expect(health.ready()).rejects.toThrow();
    expect(databasePing).not.toHaveBeenCalled();
  });
});
