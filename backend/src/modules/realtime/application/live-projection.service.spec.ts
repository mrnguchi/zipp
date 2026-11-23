import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { LiveProjectionService } from './live-projection.service.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { RidesFacade } from '../../rides/rides.facade.js';
import { DeliveriesFacade } from '../../deliveries/deliveries.facade.js';
import type { LiveJobProjection } from '../../../shared/contracts/live-job.js';
import type { LiveAuth } from '../contracts/realtime.schemas.js';
import { ApiError } from '../../../shared/errors/api-error.js';
describe('M7 authoritative projection contract', () => {
  it('reauthenticates per read, routes through owning facades and returns only a bounded view', async () => {
    const id = randomUUID(),
      a = { userId: randomUUID() },
      auth: LiveAuth = {
        schemaVersion: 1,
        accessToken: 'opaque-token-double',
        jobType: 'DELIVERY',
        jobId: id,
        afterVersion: 0,
      },
      receivedAt = new Date(),
      p: LiveJobProjection = {
        jobType: 'DELIVERY',
        jobId: id,
        version: 8,
        status: 'IN_TRANSIT',
        custody: 'WITH_COURIER',
        terminal: false,
        position: { latitude: 4.05, longitude: 9.7, receivedAt, stale: false },
      },
      authenticate = jest.fn(() => Promise.resolve(a)),
      delivery = jest
        .fn<(actor: unknown, id: string) => Promise<LiveJobProjection>>()
        .mockResolvedValue(p),
      ride = jest
        .fn<(actor: unknown, id: string) => Promise<LiveJobProjection>>()
        .mockResolvedValue(p);
    const module = await Test.createTestingModule({
        providers: [
          LiveProjectionService,
          { provide: IdentityFacade, useValue: { authenticate } },
          { provide: DeliveriesFacade, useValue: { liveSnapshot: delivery } },
          { provide: RidesFacade, useValue: { liveSnapshot: ride } },
        ],
      }).compile(),
      service = module.get(LiveProjectionService);
    const first = await service.read(auth, 2);
    expect(first.resyncRequired).toBe(true);
    expect(first.position?.receivedAt).toBe(receivedAt.toISOString());
    expect(first).not.toHaveProperty('accessToken');
    expect(delivery).toHaveBeenCalledWith(a, id);
    expect(ride).not.toHaveBeenCalled();
    expect((await service.read(auth, 7)).resyncRequired).toBe(false);
    expect(authenticate).toHaveBeenCalledTimes(2);
    authenticate.mockRejectedValueOnce(
      new ApiError('INVALID_CREDENTIALS', 401, 'expired'),
    );
    await expect(service.read(auth, 8)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(delivery).toHaveBeenCalledTimes(2);
  });
});
