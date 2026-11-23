import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { OperationsController } from '../../src/modules/operations/presentation/operations.controller.js';
import { OperationsService } from '../../src/modules/operations/application/operations.service.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import { ApiSecurityGuard } from '../../src/platform/security/security.module.js';
import { HttpErrorFilter } from '../../src/shared/errors/http-error.filter.js';
import { ApiError } from '../../src/shared/errors/api-error.js';
import { AppLogger } from '../../src/platform/observability/app-logger.js';
import { testConfig } from '../helpers/test-config.js';
import type { Actor } from '../../src/shared/contracts/actor.js';
// Real HTTP/global guard; service doubles do not prove MFA, DB or owning actions.
describe('M7 operations HTTP boundaries (written, not run)', () => {
  let app: NestExpressApplication, server: Server;
  const id = randomUUID(),
    token = 's'.repeat(40),
    customerToken = 'c'.repeat(40),
    a: Actor = {
      userId: randomUUID(),
      sessionId: randomUUID(),
      roles: ['SUPPORT'],
      mfaEnabled: true,
      mfaVerifiedAt: new Date(),
    };
  const open = jest.fn<OperationsService['open']>();
  beforeAll(async () => {
    open.mockResolvedValue({
      caseId: id,
      version: 1,
      status: 'OPEN',
      accountStatus: null,
    });
    const module = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [
        {
          provide: OperationsService,
          useValue: {
            open,
            capabilities: () =>
              Promise.resolve({ automaticFraudDecisions: false }),
          },
        },
        {
          provide: IdentityFacade,
          useValue: {
            pseudonym: (_p: string, v: string) => v,
            authenticate: (v: string) =>
              v === token
                ? Promise.resolve(a)
                : v === customerToken
                  ? Promise.resolve({ ...a, roles: ['CUSTOMER'] })
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
    app.use((_q: Request, r: Response, next: NextFunction) => {
      r.locals['requestId'] = randomUUID();
      r.setHeader('Cache-Control', 'no-store');
      next();
    });
    app.useGlobalFilters(new HttpErrorFilter(new AppLogger(testConfig)));
    await app.init();
    server = app.getHttpServer();
  });
  afterAll(() => app.close());
  it('requires a staff identity and enforces ADMIN-only account actions', async () => {
    await request(server).get('/api/v1/operations/capabilities').expect(401);
    await request(server)
      .get('/api/v1/operations/capabilities')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    await request(server)
      .post(`/api/v1/operations/cases/${id}/account-status`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);
  });
  it('validates scoped keys, private descriptions and rejects role/ledger/job injection', async () => {
    const body = {
      subjectType: 'ACCOUNT',
      subjectId: randomUUID(),
      reasonCode: 'OTHER',
      description: 'Private staff review',
    };
    await request(server)
      .post('/api/v1/operations/cases')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(400);
    for (const extra of [
      { roles: ['ADMIN'] },
      { balanceXaf: '1000' },
      { forceDelivered: true },
    ])
      await request(server)
        .post('/api/v1/operations/cases')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ ...body, ...extra })
        .expect(400);
    expect(open).not.toHaveBeenCalled();
    const response = await request(server)
      .post('/api/v1/operations/cases')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID().toUpperCase())
      .send(body)
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).not.toHaveProperty('description');
  });
  it('bounds page sizes and requires a reason for subject inspection', async () => {
    await request(server)
      .get('/api/v1/operations/cases?limit=50000')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(server)
      .get(`/api/v1/operations/subjects/ACCOUNT/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
