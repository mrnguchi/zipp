import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import request from 'supertest';
import { ApiSecurityGuard } from '../../src/platform/security/security.module.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import { ApiError } from '../../src/shared/errors/api-error.js';
import { BusinessError } from '../../src/shared/errors/business-error.js';
import { AppLogger } from '../../src/platform/observability/app-logger.js';
import { TelemetryService } from '../../src/platform/observability/telemetry.service.js';
import { configureHttp } from '../../src/bootstrap.js';
import { testConfig } from '../helpers/test-config.js';
import type { Actor } from '../../src/shared/contracts/actor.js';
import {
  DeliveriesController,
  CourierDeliveriesController,
  DeliveryOperationsController,
  DeliveryPhotosController,
  PublicDeliveryTrackingController,
} from '../../src/modules/deliveries/presentation/deliveries.controller.js';
import { DeliveryBookingService } from '../../src/modules/deliveries/application/delivery-booking.service.js';
import { DeliveryReadService } from '../../src/modules/deliveries/application/delivery-read.service.js';
import { DeliveryLifecycleService } from '../../src/modules/deliveries/application/delivery-lifecycle.service.js';
import { DeliveryReviewService } from '../../src/modules/deliveries/application/delivery-review.service.js';
import { DeliveryCodeService } from '../../src/modules/deliveries/application/delivery-code.service.js';
import { DeliveryPhotoService } from '../../src/modules/deliveries/application/delivery-photo.service.js';
import { DeliveryTrackingService } from '../../src/modules/deliveries/application/delivery-tracking.service.js';
import { DeliveryOfferService } from '../../src/modules/deliveries/application/delivery-offer.service.js';
// Written, not run. Real transport/security guard with explicit application doubles;
// the separate isolated PostgreSQL suite owns service/custody/concurrency evidence.
describe('M6 HTTP validation, permission and private transport contract', () => {
  let app: NestExpressApplication, server: Server;
  const owner: Actor = {
      userId: randomUUID(),
      sessionId: randomUUID(),
      roles: ['CUSTOMER'],
      mfaEnabled: false,
      mfaVerifiedAt: null,
    },
    admin: Actor = { ...owner, userId: randomUUID(), roles: ['ADMIN'] },
    courier: Actor = { ...owner, userId: randomUUID(), roles: ['DRIVER'] },
    id = randomUUID(),
    photoId = randomUUID(),
    bytes = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  const actors: Record<string, Actor> = { owner, admin, courier };
  const keys = (value: unknown) => {
    if (!value || typeof value !== 'object')
      throw Error('Expected response object');
    return Object.keys(value).sort();
  };
  const reads = {
    snapshot: jest.fn((a: Actor, target: string) => {
      if (a.userId !== owner.userId || target !== id)
        return Promise.reject(
          new BusinessError('NOT_FOUND', 'Delivery not found'),
        );
      return Promise.resolve({ id, status: 'ASSIGNED', version: 2 });
    }),
    events: jest.fn((_a: Actor, _id: string, after: number) =>
      Promise.resolve({ items: [], nextVersion: after }),
    ),
  };
  const booking = {
    book: jest.fn(() =>
      Promise.reject(
        new BusinessError(
          'INSUFFICIENT_FUNDS',
          'Wallet does not cover the fare',
        ),
      ),
    ),
  };
  const photos = {
    intent: jest.fn(() =>
      Promise.resolve({
        id: photoId,
        byteLength: bytes.length,
        uploadExpiresAt: new Date(Date.now() + 600000),
      }),
    ),
    uploadIntent: jest.fn((a: Actor, target: string) => {
      if (a.userId !== owner.userId || target !== photoId)
        return Promise.reject(
          new BusinessError('NOT_FOUND', 'Photo not found'),
        );
      return Promise.resolve({ byteLength: bytes.length });
    }),
    upload: jest.fn((_a: Actor, _id: string, b: Uint8Array) => {
      expect(Buffer.from(b)).toEqual(bytes);
      return Promise.resolve({ id: photoId, status: 'STORED' });
    }),
    download: jest.fn(() =>
      Promise.resolve({ bytes, contentType: 'image/png' }),
    ),
  };
  const codes = {
    issue: jest.fn(() =>
      Promise.resolve({
        requestId: randomUUID(),
        purpose: 'PICKUP',
        expiresAt: new Date(Date.now() + 900000),
      }),
    ),
  };
  const tracking = {
    issue: jest.fn((_a: Actor, _id: string, input: { id: string }) =>
      Promise.resolve({
        id: input.id,
        expiresAt: new Date(Date.now() + 3600000),
        revokedAt: null,
      }),
    ),
    publicView: jest.fn((auth: unknown) => {
      if (auth !== 'Bearer capability')
        return Promise.reject(
          new BusinessError('NOT_FOUND', 'Tracking unavailable'),
        );
      return Promise.resolve({ status: 'IN_TRANSIT', position: null });
    }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        DeliveriesController,
        CourierDeliveriesController,
        DeliveryOperationsController,
        DeliveryPhotosController,
        PublicDeliveryTrackingController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ApiSecurityGuard },
        {
          provide: IdentityFacade,
          useValue: {
            pseudonym: (purpose: string, value: string) =>
              createHash('sha256')
                .update(purpose + value)
                .digest('hex'),
            authenticate: (token: string) => {
              const a = actors[token];
              if (!a) throw new ApiError('UNAUTHENTICATED', 401, 'Sign in');
              return Promise.resolve(a);
            },
          },
        },
        {
          provide: RateLimitPort,
          useValue: { consume: () => Promise.resolve() },
        },
        { provide: AppLogger, useValue: new AppLogger(testConfig) },
        {
          provide: TelemetryService,
          useValue: new TelemetryService(testConfig),
        },
        ...(
          [
            [DeliveryBookingService, booking],
            [DeliveryReadService, reads],
            [DeliveryPhotoService, photos],
            [DeliveryCodeService, codes],
            [DeliveryTrackingService, tracking],
            [DeliveryLifecycleService, {}],
            [DeliveryReviewService, {}],
            [DeliveryOfferService, { list: () => ({ items: [] }) }],
          ] as const
        ).map(([provide, useValue]) => ({ provide, useValue })),
      ],
    }).compile();
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
  const body = {
    quoteId: randomUUID(),
    perspective: 'SENDING',
    sender: { name: 'Sender', phone: '+237612345678' },
    recipient: { name: 'Recipient', phone: '+237698765432' },
    package: {
      description: 'Private documents',
      size: 'SMALL',
      weightGrams: 500,
      photoId,
    },
    contactSharingConsent: true,
    acceptTerms: true,
  };
  it('rejects anonymous, wrong-role and missing-recent-MFA callers', async () => {
    await request(server).get(`/api/v1/deliveries/${id}`).expect(401);
    await request(server)
      .get('/api/v1/courier/deliveries/offers')
      .auth('owner', { type: 'bearer' })
      .expect(403);
    await request(server)
      .get(`/api/v1/admin/deliveries/${id}`)
      .auth('admin', { type: 'bearer' })
      .expect(403);
  });
  it('enforces ownership and supplies safe no-store error envelopes', async () => {
    const res = await request(server)
      .get(`/api/v1/deliveries/${id}`)
      .auth('courier', { type: 'bearer' })
      .expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toHaveProperty('requestId');
  });
  it('requires idempotency identity and rejects extra actor/price fields before booking', async () => {
    const before = booking.book.mock.calls.length;
    await request(server)
      .post('/api/v1/deliveries')
      .auth('owner', { type: 'bearer' })
      .send(body)
      .expect(400);
    await request(server)
      .post('/api/v1/deliveries')
      .auth('owner', { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, bookerUserId: owner.userId, totalAmountXaf: '1' })
      .expect(400);
    expect(booking.book.mock.calls.length).toBe(before);
  });
  it('maps a booking failure to a safe HTTP conflict without claiming success', async () => {
    const res = await request(server)
      .post('/api/v1/deliveries')
      .auth('owner', { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(409);
    expect(res.body).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });
  it('bounds event resync input and returns the requested cursor', async () => {
    await request(server)
      .get(`/api/v1/deliveries/${id}/events?afterVersion=-1`)
      .auth('owner', { type: 'bearer' })
      .expect(400);
    await request(server)
      .get(`/api/v1/deliveries/${id}/events?afterVersion=7`)
      .auth('owner', { type: 'bearer' })
      .expect(200, { items: [], nextVersion: 7 });
  });
  it('acknowledges contact-code issuance without a raw proof', async () => {
    const res = await request(server)
      .post(`/api/v1/deliveries/${id}/contact-codes`)
      .auth('owner', { type: 'bearer' })
      .send({ purpose: 'PICKUP' })
      .expect(200);
    expect(keys(res.body)).toEqual(['expiresAt', 'purpose', 'requestId']);
  });
  it('accepts client-owned tracking credentials but returns metadata only', async () => {
    const capId = randomUUID(),
      res = await request(server)
        .post(`/api/v1/deliveries/${id}/tracking-capabilities`)
        .auth('owner', { type: 'bearer' })
        .send({ id: capId, secret: 'A'.repeat(43), ttlSeconds: 3600 })
        .expect(201);
    expect(keys(res.body)).toEqual(['expiresAt', 'id', 'revokedAt']);
    expect(res.text).not.toContain('A'.repeat(43));
  });
  it('uses capability authorization only for the reviewed public view', async () => {
    await request(server)
      .get('/api/v1/delivery-tracking?token=capability')
      .expect(404);
    await request(server)
      .get('/api/v1/delivery-tracking')
      .set('Authorization', 'Bearer capability')
      .expect(200, { status: 'IN_TRANSIT', position: null });
  });
  it('requires raw bounded octet-stream uploads and private attachment headers', async () => {
    const before = photos.upload.mock.calls.length;
    await request(server)
      .put(`/api/v1/delivery-photos/${photoId}/content`)
      .auth('owner', { type: 'bearer' })
      .send({ bytes: 'not binary' })
      .expect(400);
    expect(photos.upload.mock.calls.length).toBe(before);
    await request(server)
      .put(`/api/v1/delivery-photos/${photoId}/content`)
      .auth('owner', { type: 'bearer' })
      .set('Content-Type', 'application/octet-stream')
      .set('Content-Length', String(bytes.length))
      .send(bytes)
      .expect(200);
    const file = await request(server)
      .get(`/api/v1/delivery-photos/${photoId}/content`)
      .auth('owner', { type: 'bearer' })
      .expect(200);
    expect(file.headers['content-type']).toMatch(/^image\/png/);
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toBe('no-store');
  });
});
