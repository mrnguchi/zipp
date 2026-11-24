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
import { CallingController } from '../../src/modules/calling/presentation/calling.controller.js';
import { CallingConfig } from '../../src/modules/calling/calling.config.js';
import { CallRelayConfig } from '../../src/modules/calling/call-relay.config.js';
import { CallRelayService } from '../../src/modules/calling/application/call-relay.service.js';
import { CallCreateService } from '../../src/modules/calling/application/call-create.service.js';
import { CallLifecycleService } from '../../src/modules/calling/application/call-lifecycle.service.js';
import { CallReadService } from '../../src/modules/calling/application/call-read.service.js';
import { CallSignalingService } from '../../src/modules/calling/application/call-signaling.service.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import { ApiSecurityGuard } from '../../src/platform/security/security.module.js';
import { HttpErrorFilter } from '../../src/shared/errors/http-error.filter.js';
import { ApiError } from '../../src/shared/errors/api-error.js';
import { AppLogger } from '../../src/platform/observability/app-logger.js';
import { testConfig } from '../helpers/test-config.js';
import type { Actor } from '../../src/shared/contracts/actor.js';
// Real HTTP/global guard with service/admission doubles; no call/media/runtime proof.
describe('M7.4 call HTTP boundaries (written, not run)', () => {
  let app: NestExpressApplication, server: Server;
  const token = 'a'.repeat(40),
    a: Actor = {
      userId: randomUUID(),
      sessionId: randomUUID(),
      roles: ['CUSTOMER'],
      mfaEnabled: false,
      mfaVerifiedAt: null,
    },
    id = randomUUID();
  const create = jest.fn<CallCreateService['create']>(),
    command = jest.fn<CallLifecycleService['command']>(),
    send = jest.fn<CallSignalingService['send']>(),
    read = jest.fn<CallSignalingService['read']>(),
    issueRelay = jest.fn<CallRelayService['issue']>();
  const device = () => ({
    deviceId: randomUUID(),
    deviceGeneration: 1,
    proof: randomBytes(32).toString('base64url'),
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CallingController],
      providers: [
        { provide: CallCreateService, useValue: { create } },
        { provide: CallLifecycleService, useValue: { command } },
        {
          provide: CallReadService,
          useValue: { active: () => Promise.resolve({ call: null }) },
        },
        { provide: CallSignalingService, useValue: { send, read } },
        { provide: CallRelayConfig, useValue: new CallRelayConfig({}) },
        { provide: CallRelayService, useValue: { issue: issueRelay } },
        {
          provide: CallingConfig,
          useValue: new CallingConfig({
            NODE_ENV: 'test',
            AUTH_ENABLED: 'true',
            NOTIFICATIONS_ENABLED: 'true',
            CALLING_ENABLED: 'true',
            CALL_SIGNAL_KEY: '55'.repeat(32),
          }),
        },
        {
          provide: IdentityFacade,
          useValue: {
            pseudonym: (_p: string, v: string) => v,
            authenticate: (value: string) =>
              value === token
                ? Promise.resolve(a)
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
    create.mockResolvedValue({ callId: id, status: 'RINGING', version: 1 });
  });
  afterAll(() => app.close());
  it('requires private auth and reports local-control capabilities honestly', async () => {
    await request(server).get('/api/v1/calling/capabilities').expect(401);
    const response = await request(server)
      .get('/api/v1/calling/capabilities')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toMatchObject({
      mode: 'LOCAL_CONTROL',
      audioAvailable: false,
      turnCredentialsAvailable: false,
      nativeIncomingCalls: false,
    });
    await request(server)
      .post(`/api/v1/calling/calls/${id}/connected`)
      .set('Authorization', `Bearer ${token}`)
      .send({ connected: true })
      .expect(404);
  });
  it('keeps relay proof in a strict POST body, requires auth and returns no-store without a persisted command key', async () => {
    const input = { ...device(), epoch: 1 as const, expectedVersion: 2 };
    await request(server)
      .post(`/api/v1/calling/calls/${id}/relay-credentials`)
      .send(input)
      .expect(401);
    for (const invalid of [
      { ...input, peerUserId: randomUUID() },
      { ...input, epoch: 2 },
      { ...input, proof: 'weak' },
      { ...input, urls: ['turn:arbitrary'] },
    ])
      await request(server)
        .post(`/api/v1/calling/calls/${id}/relay-credentials`)
        .set('Authorization', `Bearer ${token}`)
        .send(invalid)
        .expect(400);
    expect(issueRelay).not.toHaveBeenCalled();
    issueRelay.mockRejectedValue(
      new ApiError(
        'FEATURE_DISABLED',
        503,
        'Relay credentials unavailable',
        60,
      ),
    );
    const disabled = await request(server)
      .post(`/api/v1/calling/calls/${id}/relay-credentials`)
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(503);
    expect(disabled.headers['cache-control']).toBe('no-store');
    expect(disabled.text).not.toContain(input.proof);
    expect(disabled.headers['retry-after']).toBe('60');
    issueRelay.mockResolvedValue({
      iceServers: [
        {
          urls: [
            'turn:192.168.1.50:3478?transport=udp',
            'turn:192.168.1.50:3478?transport=tcp',
          ],
          username: 'opaque-grant',
          credential: 'unit-ephemeral',
        },
      ],
      iceTransportPolicy: 'relay',
      expiresAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      audioAvailable: false,
    });
    const response = await request(server)
      .post(`/api/v1/calling/calls/${id}/relay-credentials`)
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain(input.proof);
    expect(issueRelay).toHaveBeenLastCalledWith(a, id, input);
  });
  it('validates idempotency keys and refuses actor/room/provider injection', async () => {
    const input = {
      ...device(),
      jobType: 'RIDE',
      jobId: randomUUID(),
      peerUserId: randomUUID(),
    };
    await request(server)
      .post('/api/v1/calling/calls')
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(400);
    for (const extra of [
      { callerUserId: randomUUID() },
      { room: 'private' },
      { status: 'CONNECTED' },
    ])
      await request(server)
        .post('/api/v1/calling/calls')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ ...input, ...extra })
        .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
  it('bounds SDP/sequence/candidate input and never accepts proof in an unvalidated URL route', async () => {
    await request(server)
      .post(`/api/v1/calling/calls/${id}/signals`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...device(),
        epoch: 1,
        packet: {
          messageId: randomUUID(),
          sequence: 65,
          payload: { type: 'OFFER', sdp: 'opaque' },
        },
      })
      .expect(400);
    await request(server)
      .post(`/api/v1/calling/calls/${id}/signals`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...device(),
        epoch: 1,
        packet: {
          messageId: randomUUID(),
          sequence: 1,
          payload: { type: 'OFFER', sdp: 'x'.repeat(8193) },
        },
      })
      .expect(400);
    await request(server)
      .get(`/api/v1/calling/calls/${id}/signals?proof=secret`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(send).not.toHaveBeenCalled();
  });
  it('normalizes key casing and returns an immutable metadata receipt with no secret echo', async () => {
    const key = randomUUID(),
      input = {
        ...device(),
        jobType: 'RIDE' as const,
        jobId: randomUUID(),
        peerUserId: randomUUID(),
      };
    const response = await request(server)
      .post('/api/v1/calling/calls')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key.toUpperCase())
      .send(input)
      .expect(200);
    expect(create).toHaveBeenCalledWith(a, key, input);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toContain(input.proof);
    expect(response.body).toEqual({
      callId: id,
      status: 'RINGING',
      version: 1,
    });
  });
});
