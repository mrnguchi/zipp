import { Inject, Injectable } from '@nestjs/common';
import { DriverService } from './application/driver.service.js';
import { DriverRepository } from './application/driver.repository.js';
import type { Actor } from '../../shared/contracts/actor.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import { assertApproved, freshPresence } from './domain/eligibility.js';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import type { DriverClass } from './contracts/driver-contracts.js';
import { IdentityFacade } from '../identity/identity.facade.js';
import { JobsFacade } from '../jobs/jobs.facade.js';
import type { LocationInput } from './contracts/driver.schemas.js';
import { assertPlausibleLocation } from './domain/location.js';
import { ApiError } from '../../shared/errors/api-error.js';

@Injectable()
export class DriversFacade {
  async operationsSummary(c: TransactionContext, a: Actor, id: string) {
    const first = await this.repository.find(id, c);
    if (!first) throw new BusinessError('NOT_FOUND', 'Driver not found');
    await this.identity.authorize(c, a, ['SUPPORT', 'ADMIN'], true, [
      first.ownerUserId,
    ]);
    const d = await this.repository.find(id, c);
    if (!d) throw new BusinessError('NOT_FOUND', 'Driver not found');
    return {
      id: d.id,
      ownerUserId: d.ownerUserId,
      status: d.status,
      revision: d.revision,
      approvedClasses: d.approvedClasses,
    };
  }
  /** Caller must hold participant locks and verify an existing WITH_COURIER job.
   * These methods never confer approval, roles or eligibility for a new job. */
  async custodyPosition(context: TransactionContext, userId: string) {
    const d = await this.repository.findOwner(userId, context);
    if (!d)
      throw new BusinessError(
        'LOCATION_NOT_FRESH',
        'Courier location unavailable',
      );
    await this.repository.lock(context, d.id);
    const current = await this.repository.find(d.id, context);
    if (
      !current ||
      !freshPresence(current) ||
      current.presence?.latitude === null ||
      current.presence?.longitude === null ||
      !current.presence
    )
      throw new BusinessError(
        'LOCATION_NOT_FRESH',
        'Fresh custody location required',
      );
    await this.identity.validateCustodySession(
      context,
      userId,
      current.presence.authSessionId,
    );
    return current.presence;
  }
  async custodyEpoch(context: TransactionContext, actor: Actor) {
    const d = await this.repository.findOwner(actor.userId, context);
    if (!d) throw new BusinessError('NOT_FOUND', 'Courier not found');
    await this.repository.lock(context, d.id);
    return this.repository.setPresence(context, d.id, actor.sessionId, true);
  }
  async custodyLocation(
    context: TransactionContext,
    actor: Actor,
    input: LocationInput,
  ) {
    const d = await this.repository.findOwner(actor.userId, context);
    if (!d) throw new BusinessError('NOT_FOUND', 'Courier not found');
    await this.repository.lock(context, d.id);
    const current = await this.repository.find(d.id, context),
      p = current?.presence,
      now = Date.now(),
      captured = Date.parse(input.capturedAt);
    if (
      !p?.online ||
      p.authSessionId !== actor.sessionId ||
      p.locationSessionId !== input.locationSessionId ||
      p.sessionExpiresAt.getTime() <= now
    )
      throw new BusinessError(
        'LOCATION_SESSION_EXPIRED',
        'Create a current custody location session',
      );
    if (input.sequence <= p.sequence)
      throw new BusinessError(
        'LOCATION_SEQUENCE_CONFLICT',
        'Location update is not newer',
      );
    if (captured < now - 15000 || captured > now + 5000)
      throw new BusinessError(
        'STALE_LOCATION',
        'Location timestamp is not current',
      );
    if (p.receivedAt && now - p.receivedAt.getTime() < 3000)
      throw new ApiError(
        'RATE_LIMITED',
        429,
        'Location updates are limited to one per three seconds',
        3,
      );
    assertPlausibleLocation(p, input);
    return this.repository.acceptLocation(context, d.id, input);
  }
  constructor(
    @Inject(DriverService) private readonly service: DriverService,
    @Inject(DriverRepository) private readonly repository: DriverRepository,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
  ) {}
  eligibility(actor: Actor) {
    return this.service.eligibility(actor);
  }
  /** M5 must call under the shared assignment/user transaction locks. */
  async assertDispatchEligible(
    context: TransactionContext,
    ownerUserId: string,
    serviceClass: DriverClass,
    requireFree = true,
  ) {
    const driver = await this.repository.findOwner(ownerUserId, context);
    if (!driver)
      throw new BusinessError(
        'DRIVER_NOT_ELIGIBLE',
        'Driver application required',
      );
    await this.repository.lock(context, driver.id);
    const current = await this.repository.find(driver.id, context);
    if (!current)
      throw new BusinessError(
        'DRIVER_NOT_ELIGIBLE',
        'Driver application required',
      );
    assertApproved(
      current,
      await this.repository.documents(current.id, current.revision, context),
    );
    if (
      !current.presence ||
      !current.approvedClasses.includes(serviceClass) ||
      !freshPresence(current)
    )
      throw new BusinessError(
        'DRIVER_NOT_ELIGIBLE',
        'Driver class or location is unavailable',
      );
    await this.identity.validateDriverSession(
      context,
      ownerUserId,
      current.presence.authSessionId,
    );
    if (requireFree) await this.jobs.assertDriverFree(context, ownerUserId);
    return { driverApplicationId: current.id, location: current.presence };
  }
  candidates(
    pickup: { latitude: number; longitude: number },
    radiusMeters: number,
    serviceClass: DriverClass,
    excludeUserId: string,
  ) {
    return this.repository.candidates(
      pickup,
      radiusMeters,
      serviceClass,
      excludeUserId,
    );
  }
  /** Precise snapshots are for a caller that already authorized an active job participant. */
  async trackingPosition(
    context: TransactionContext,
    ownerUserId: string,
    serviceClass: DriverClass,
  ) {
    const initial = await this.repository.findOwner(ownerUserId, context);
    if (!initial)
      throw new BusinessError('DRIVER_NOT_ELIGIBLE', 'Driver unavailable');
    await this.repository.lock(context, initial.id);
    const current = await this.repository.find(initial.id, context);
    if (!current)
      throw new BusinessError('DRIVER_NOT_ELIGIBLE', 'Driver unavailable');
    assertApproved(
      current,
      await this.repository.documents(current.id, current.revision, context),
    );
    const p = current.presence;
    if (
      !p?.online ||
      !current.approvedClasses.includes(serviceClass) ||
      p.sessionExpiresAt <= new Date() ||
      !p.receivedAt ||
      Date.now() - p.receivedAt.getTime() > 30000 ||
      p.latitude === null ||
      p.longitude === null
    )
      throw new BusinessError('LOCATION_NOT_FRESH', 'No recent position');
    await this.identity.validateDriverSession(
      context,
      ownerUserId,
      p.authSessionId,
    );
    return { position: p, stale: !freshPresence(current) };
  }
}
