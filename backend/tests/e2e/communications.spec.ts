import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { CommunicationsController } from '../../src/modules/communications/presentation/communications.controller.js';
import { CommunicationCommandService } from '../../src/modules/communications/application/communication-command.service.js';
import { CommunicationReadService } from '../../src/modules/communications/application/communication-read.service.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import { ApiSecurityGuard } from '../../src/platform/security/security.module.js';
import { HttpErrorFilter } from '../../src/shared/errors/http-error.filter.js';
import { ApiError } from '../../src/shared/errors/api-error.js';
import { AppLogger } from '../../src/platform/observability/app-logger.js';
import { testConfig } from '../helpers/test-config.js';
import type { Actor } from '../../src/shared/contracts/actor.js';
// Real HTTP validation/global security guard with command/admission doubles.
// Source only; authoritative DB policy/races are covered in the isolated integration suite.
describe('M7.2 HTTP security and validation contracts (written, not run)', () => {
  let app: NestExpressApplication, server: Server;
  const id = randomUUID(),
    token = 'a'.repeat(40),
    staffToken = 'b'.repeat(40),
    noMfaToken = 'c'.repeat(40);
  const owner: Actor = {
    userId: randomUUID(),
    sessionId: randomUUID(),
    roles: ['CUSTOMER'],
    mfaEnabled: false,
    mfaVerifiedAt: null,
  };
  const receipt = {
    threadId: id,
    messageId: randomUUID(),
    sequence: 1,
    version: 1,
  };
  const commands = {
    openJob: jest.fn<CommunicationCommandService['openJob']>(),
    createTicket: jest.fn<CommunicationCommandService['createTicket']>(),
    send: jest.fn<CommunicationCommandService['send']>(),
    changeStatus: jest.fn<CommunicationCommandService['changeStatus']>(),
  };
  const reads = {
    snapshot: jest.fn<CommunicationReadService['snapshot']>(),
    history: jest.fn<CommunicationReadService['history']>(),
    acknowledge: jest.fn<CommunicationReadService['acknowledge']>(),
    tickets: jest.fn<CommunicationReadService['tickets']>(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CommunicationsController],
      providers: [
        { provide: CommunicationCommandService, useValue: commands },
        { provide: CommunicationReadService, useValue: reads },
        {
          provide: IdentityFacade,
          useValue: {
            pseudonym: (_purpose: string, value: string) => value,
            authenticate: (value: string) => {
              if (value === token) return Promise.resolve(owner);
              if (value === staffToken)
                return Promise.resolve({
                  ...owner,
                  roles: ['SUPPORT'],
                  mfaEnabled: true,
                  mfaVerifiedAt: new Date(),
                });
              if (value === noMfaToken)
                return Promise.resolve({ ...owner, roles: ['SUPPORT'] });
              return Promise.reject(
                new ApiError('UNAUTHENTICATED', 401, 'Sign in'),
              );
            },
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
    commands.send.mockResolvedValue(receipt);
    commands.createTicket.mockResolvedValue(receipt);
    commands.changeStatus.mockResolvedValue({
      ...receipt,
      messageId: null,
      sequence: null,
    });
    reads.tickets.mockResolvedValue({ items: [], nextCursor: null });
  });
  afterAll(() => app.close());
  it('requires private authentication before command work', async () => {
    await request(server)
      .post(`/api/v1/communications/threads/${id}/messages`)
      .send({ body: 'hi' })
      .expect(401);
    await request(server)
      .get(`/api/v1/communications/threads/${id}`)
      .set('Authorization', 'Bearer invalid')
      .expect(401);
    expect(commands.send).not.toHaveBeenCalled();
    expect(reads.snapshot).not.toHaveBeenCalled();
  });
  it('requires UUID idempotency keys and rejects ownership injection', async () => {
    for (const key of ['', 'private-key'])
      await request(server)
        .post(`/api/v1/communications/threads/${id}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send({ body: 'hi' })
        .expect(400);
    await request(server)
      .post(`/api/v1/communications/threads/${id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'hi', authorUserId: randomUUID() })
      .expect(400);
    expect(commands.send).not.toHaveBeenCalled();
  });
  it('normalizes a UUID key and returns only the accepted command receipt', async () => {
    const key = randomUUID();
    const response = await request(server)
      .post(`/api/v1/communications/threads/${id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key.toUpperCase())
      .send({ body: '  hello  ' })
      .expect(200);
    expect(commands.send).toHaveBeenCalledWith(owner, key, id, 'hello');
    expect(response.body).toEqual(receipt);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects malformed IDs, control characters, oversized messages and cursors', async () => {
    for (const body of ['\u0000private', 'a'.repeat(2001)])
      await request(server)
        .post(`/api/v1/communications/threads/${id}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ body })
        .expect(400);
    await request(server)
      .get('/api/v1/communications/threads/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(server)
      .get(`/api/v1/communications/threads/${id}/messages?limit=51`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(server)
      .put(`/api/v1/communications/threads/${id}/read-cursor`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sequence: 2001 })
      .expect(400);
    expect(commands.send).not.toHaveBeenCalled();
    expect(reads.acknowledge).not.toHaveBeenCalled();
  });
  it('scopes the support queue to staff with recent MFA', async () => {
    for (const value of [token, noMfaToken])
      await request(server)
        .get('/api/v1/communications/support/tickets')
        .set('Authorization', `Bearer ${value}`)
        .expect(403);
    await request(server)
      .get('/api/v1/communications/support/tickets')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(reads.tickets).toHaveBeenCalledTimes(1);
    expect(reads.tickets).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ['SUPPORT'] }),
      { limit: 20 },
      true,
    );
  });
  it('does not leak dependency text or private body in errors', async () => {
    commands.send.mockRejectedValueOnce(
      new Error('private database credentials and body'),
    );
    const response = await request(server)
      .post(`/api/v1/communications/threads/${id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'private body' })
      .expect(500);
    expect(response.body).toMatchObject({
      code: 'INTERNAL_ERROR',
      requestId: expect.any(String),
    });
    expect(response.text).not.toContain('credentials');
    expect(response.text).not.toContain('private body');
  });
});
