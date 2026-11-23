import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RideRepository } from './ride.repository.js';
import { RideRequestService } from './ride-request.service.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import { RidesConfig } from '../rides.config.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
@Injectable()
export class RideBookingService {
  constructor(
    @Inject(RideRepository) private readonly repository: RideRepository,
    @Inject(RideRequestService) private readonly requests: RideRequestService,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(PricingFacade) private readonly pricing: PricingFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(RidesConfig) private readonly config: RidesConfig,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
  ) {}
  async book(actor: Actor, key: string, quoteId: string) {
    this.config.assertEnabled();
    const normalized = quoteId.toLowerCase(),
      fingerprint = this.requests.fingerprint([normalized]);
    await this.limiter.consume([
      {
        key: `ride-booking:${this.identity.pseudonym('actor', actor.userId)}`,
        limit: 5,
        windowMs: 60000,
      },
    ]);
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      const replay = await this.requests.replay(
        context,
        actor.userId,
        'BOOK',
        key,
        fingerprint,
      );
      if (replay) return replay;
      if (await this.repository.activeCustomerRide(context, actor.userId))
        throw new BusinessError(
          'ACTIVE_RIDE_CONFLICT',
          'Finish or cancel the active ride first',
        );
      const id = randomUUID(),
        quote = await this.pricing.consumeQuote(
          context,
          actor,
          normalized,
          `ride:${id}`,
        );
      if (!['EVERYDAY', 'COMFORT', 'PREMIUM'].includes(quote.serviceClass))
        throw new BusinessError(
          'VALIDATION_ERROR',
          'A ride-class quote is required',
        );
      const terms = await this.pricing.bookingTerms(context, normalized);
      await this.jobs.create(context, id, actor.userId, 'RIDE');
      const reservation = await this.finance.reserveFunds(
        context,
        actor,
        `ride:${id}`,
        quote.totalAmountXaf.toString(),
      );
      const a = terms.serviceArea;
      const ride = await this.repository.create(
        context,
        {
          id,
          customerUserId: actor.userId,
          quoteId: quote.id,
          reservationId: reservation.id,
          serviceAreaId: a.id,
          serviceClass: quote.serviceClass,
          quotedAmountXaf: quote.totalAmountXaf,
          commissionBps: terms.commissionBps,
          cancellationFeeXaf: terms.cancellationFeeXaf,
          pickupLatitude: quote.pickupLatitude,
          pickupLongitude: quote.pickupLongitude,
          destinationLatitude: quote.destinationLatitude,
          destinationLongitude: quote.destinationLongitude,
          distanceMeters: quote.distanceMeters,
          durationSeconds: quote.durationSeconds,
          pricingPolicyVersion: terms.version,
        },
        {
          minimumLatitude: a.minimumLatitude,
          maximumLatitude: a.maximumLatitude,
          minimumLongitude: a.minimumLongitude,
          maximumLongitude: a.maximumLongitude,
        },
      );
      await this.repository.remember(
        context,
        actor.userId,
        'BOOK',
        key,
        fingerprint,
        id,
      );
      await this.audit.record(context, actor.userId, 'rides.booked');
      return ride;
    });
  }
}
