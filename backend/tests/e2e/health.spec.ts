import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module.js';
import { AppConfig } from '../../src/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import { RedisService } from '../../src/platform/redis/redis.service.js';
import { configureHttp } from '../../src/bootstrap.js';
import { testConfig } from '../helpers/test-config.js';
import { QueueMetricsService } from '../../src/platform/queues/queue-metrics.service.js';

describe('infrastructure HTTP contract', () => {
  let app: NestExpressApplication;
  let server: Server;
  let unavailable = false;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(testConfig)
      .overrideProvider(QueueMetricsService)
      .useValue({ collect: () => Promise.resolve() })
      .overrideProvider(DatabaseService)
      .useValue({
        poolStats: () => ({ total: 0, idle: 0, waiting: 0, max: 5 }),
        ping: () =>
          unavailable
            ? Promise.reject(new Error('private connection information'))
            : Promise.resolve(),
      })
      .overrideProvider(RedisService)
      .useValue({
        ping: () => Promise.resolve(),
        queue: { status: 'ready' },
        cache: { status: 'ready' },
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureHttp(app);
    await app.init();
    server = app.getHttpServer();
  });
  afterAll(async () => {
    await app.close();
  });
  it('is live and supplies request ID/security headers', async () => {
    const response = await request(server).get('/health/live').expect(200);
    expect(response.body).toEqual({ status: 'alive' });
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('is ready when dependencies pass', async () => {
    await request(server).get('/health/ready').expect(200, { status: 'ready' });
  });
  it('keeps liveness but fails readiness during outage without leaking errors', async () => {
    unavailable = true;
    const response = await request(server).get('/health/ready').expect(503);
    expect(response.text).not.toContain('private connection');
    expect(response.body).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
    await request(server).get('/health/live').expect(200);
    unavailable = false;
  });
  it('exposes no accidental product/root endpoint', async () => {
    await request(server).get('/metrics').expect(404);
    await request(server).get('/api/v1/users').expect(404);
    await request(server).get('/').expect(404);
  });
});
