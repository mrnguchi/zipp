import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { NotificationsController } from '../../src/modules/notifications/presentation/notifications.controller.js';
import { NotificationDevicesService } from '../../src/modules/notifications/application/notification-devices.service.js';
import { NotificationInboxService } from '../../src/modules/notifications/application/notification-inbox.service.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import { ApiSecurityGuard } from '../../src/platform/security/security.module.js';
import { HttpErrorFilter } from '../../src/shared/errors/http-error.filter.js';
import { ApiError } from '../../src/shared/errors/api-error.js';
import { AppLogger } from '../../src/platform/observability/app-logger.js';
import { testConfig } from '../helpers/test-config.js';
import type { Actor } from '../../src/shared/contracts/actor.js';
describe('M7.3 private notification HTTP contracts (written, not run)', () => {
  let app: NestExpressApplication, server: Server;
  const token = 'a'.repeat(40),
    actor: Actor = {
      userId: randomUUID(),
      sessionId: randomUUID(),
      roles: ['CUSTOMER'],
      mfaEnabled: false,
      mfaVerifiedAt: null,
    },
    id = randomUUID();
  const devices = {
    register: jest.fn<NotificationDevicesService['register']>(),
    revoke: jest.fn<NotificationDevicesService['revoke']>(),
    list: jest.fn<NotificationDevicesService['list']>(),
  };
  const inbox = {
    list: jest.fn<NotificationInboxService['list']>(),
    read: jest.fn<NotificationInboxService['read']>(),
  };
  const body = () => ({
    proof: randomBytes(32).toString('base64url'),
    expectedGeneration: 0,
    platform: 'IOS' as const,
    provider: 'LOCAL' as const,
    pushToken: 'local_' + 'a'.repeat(32),
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationDevicesService, useValue: devices },
        { provide: NotificationInboxService, useValue: inbox },
        {
          provide: IdentityFacade,
          useValue: {
            pseudonym: (_p: string, v: string) => v,
            authenticate: (value: string) =>
              value === token
                ? Promise.resolve(actor)
                : Promise.reject(
                    new ApiError('UNAUTHENTICATED', 401, 'Sign in'),
                  ),
          },
        },
        {
          provide: RateLimitPort,
          useValue: { consume: () => Promise.resolve() },
        },
        { provide: APP_GUARD, useClass: ApiSecurityGuard },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    app.useBodyParser('json', { limit: '16kb' });
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.locals['requestId'] = randomUUID();
      res.setHeader('Cache-Control', 'no-store');
      next();
    });
    app.useGlobalFilters(new HttpErrorFilter(new AppLogger(testConfig)));
    await app.init();
    server = app.getHttpServer();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    devices.register.mockResolvedValue({
      id,
      platform: 'IOS',
      provider: 'LOCAL',
      generation: 1,
      expiresAt: new Date().toISOString(),
      revokedAt: null,
    });
    inbox.list.mockResolvedValue({ items: [], nextCursor: null });
  });
  afterAll(() => app.close());
  it('requires private auth and rejects capability-looking/unknown credentials', async () => {
    await request(server)
      .put(`/api/v1/notifications/devices/${id}`)
      .send(body())
      .expect(401);
    await request(server)
      .get('/api/v1/notifications/inbox')
      .set('Authorization', `Bearer ${randomUUID()}.secret`)
      .expect(401);
    expect(devices.register).not.toHaveBeenCalled();
    expect(inbox.list).not.toHaveBeenCalled();
  });
  it('rejects identity injection, real tokens and malformed proof/generation', async () => {
    for (const input of [
      { ...body(), ownerUserId: randomUUID() },
      { ...body(), sessionId: randomUUID() },
      { ...body(), pushToken: 'ExponentPushToken[secret]' },
      { ...body(), proof: 'weak' },
      { ...body(), expectedGeneration: -1 },
    ])
      await request(server)
        .put(`/api/v1/notifications/devices/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(input)
        .expect(400);
    expect(devices.register).not.toHaveBeenCalled();
  });
  it('keeps registration responses no-store and metadata only', async () => {
    const input = body(),
      response = await request(server)
        .put(`/api/v1/notifications/devices/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(input)
        .expect(200);
    expect(devices.register).toHaveBeenCalledWith(actor, id, input);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain(input.proof);
    expect(response.text).not.toContain(input.pushToken);
    expect(response.body).not.toHaveProperty('ownerUserId');
  });
  it('bounds list queries, validates read body and never accepts an arbitrary send command', async () => {
    await request(server)
      .get('/api/v1/notifications/inbox?limit=51')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(server)
      .put(`/api/v1/notifications/inbox/${id}/read`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ownerUserId: randomUUID() })
      .expect(400);
    await request(server)
      .post('/api/v1/notifications/send')
      .set('Authorization', `Bearer ${token}`)
      .send({ to: randomUUID() })
      .expect(404);
    expect(inbox.read).not.toHaveBeenCalled();
  });
  it('uses safe availability errors without endpoint/credential echoes', async () => {
    devices.register.mockRejectedValueOnce(
      new ApiError('FEATURE_DISABLED', 503, 'Notifications unavailable', 60),
    );
    const response = await request(server)
      .put(`/api/v1/notifications/devices/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body())
      .expect(503);
    expect(response.body).toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(response.headers['retry-after']).toBe('60');
    expect(response.body).not.toHaveProperty('proof');
  });
});
