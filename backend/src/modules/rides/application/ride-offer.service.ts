import { Inject, Injectable } from '@nestjs/common';
import { RideRepository } from './ride.repository.js';
import { RideRequestService } from './ride-request.service.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { DriversFacade } from '../../drivers/drivers.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { distanceMeters, insideArea } from '../domain/ride-rules.js';
import { RidesConfig } from '../rides.config.js';
@Injectable()
export class RideOfferService {
  constructor(
    @Inject(RideRepository) private readonly repository: RideRepository,
    @Inject(RideRequestService) private readonly requests: RideRequestService,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(DriversFacade) private readonly drivers: DriversFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(PricingFacade) private readonly pricing: PricingFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(RidesConfig) private readonly config: RidesConfig,
  ) {}
  async respond(actor: Actor, key: string, offerId: string, accept: boolean) {
    this.config.assertEnabled();
    const action = accept ? 'ACCEPT_OFFER' : 'DECLINE_OFFER',
      fingerprint = this.requests.fingerprint([offerId.toLowerCase()]);
    return this.transactions.run(async (context) => {
      const initial = await this.repository.offer(offerId, context);
      if (!initial || initial.driverUserId !== actor.userId)
        throw new BusinessError('NOT_FOUND', 'Offer not found');
      const original = await this.repository.ride(initial.rideId, context);
      if (!original) throw new BusinessError('NOT_FOUND', 'Ride not found');
      await this.identity.authorize(
        context,
        actor,
        accept ? ['DRIVER'] : [],
        false,
        [original.customerUserId],
      );
      const replay = await this.requests.replay(
        context,
        actor.userId,
        action,
        key,
        fingerprint,
      );
      if (replay) return replay;
      // Driver aggregate lock precedes job/ride locks and is shared with suspension/location updates.
      const position = accept
        ? await this.drivers.assertDispatchEligible(
            context,
            actor.userId,
            original.serviceClass,
          )
        : null;
      await this.jobs.lock(context, original.id);
      await this.repository.lock(context, original.id);
      const ride = await this.repository.ride(original.id, context),
        offer = await this.repository.offer(offerId, context);
      if (!ride || !offer)
        throw new BusinessError('NOT_FOUND', 'Offer not found');
      if (ride.status !== 'SEARCHING')
        throw new BusinessError(
          'RIDE_ALREADY_ASSIGNED',
          'Ride is no longer available',
        );
      if (
        offer.status !== 'OFFERED' ||
        offer.expiresAt <= new Date() ||
        ride.searchExpiresAt <= new Date()
      )
        throw new BusinessError('OFFER_EXPIRED', 'Offer has expired');
      if (accept) {
        await this.identity.assertAccountActive(context, ride.customerUserId);
        await this.pricing.assertAreaActive(context, ride.serviceAreaId);
        const p = position?.location;
        if (
          !p ||
          p.latitude === null ||
          p.longitude === null ||
          !insideArea(ride, { latitude: p.latitude, longitude: p.longitude }) ||
          distanceMeters(
            { latitude: ride.pickupLatitude, longitude: ride.pickupLongitude },
            { latitude: p.latitude, longitude: p.longitude },
          ) > offer.radiusMeters
        )
          throw new BusinessError(
            'DRIVER_NOT_ELIGIBLE',
            'Driver is outside the offer pickup area',
          );
        if (ride.customerUserId === actor.userId)
          throw new BusinessError(
            'FORBIDDEN',
            'A customer cannot accept their own ride',
          );
        await this.jobs.claim(context, ride.id, actor.userId);
        await this.repository.respondOffer(context, offer.id, 'ACCEPTED');
        await this.repository.withdrawOffers(context, ride.id, offer.id);
        await this.repository.stopTask(context, ride.id);
        const updated = await this.repository.transition(
          context,
          ride.id,
          {
            status: 'ASSIGNED',
            driverUserId: actor.userId,
            assignedAt: new Date(),
          },
          'ride.assigned',
        );
        await this.repository.remember(
          context,
          actor.userId,
          action,
          key,
          fingerprint,
          ride.id,
        );
        await this.audit.record(
          context,
          actor.userId,
          'rides.offer_accepted',
          ride.customerUserId,
        );
        return updated;
      }
      await this.repository.respondOffer(context, offer.id, 'DECLINED');
      await this.repository.remember(
        context,
        actor.userId,
        action,
        key,
        fingerprint,
        ride.id,
      );
      await this.audit.record(
        context,
        actor.userId,
        'rides.offer_declined',
        ride.customerUserId,
      );
      return ride;
    });
  }
}
