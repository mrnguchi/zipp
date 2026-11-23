import { Inject, Injectable } from '@nestjs/common';
import { RideRepository } from './ride.repository.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { DriversFacade } from '../../drivers/drivers.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import type { RideRecord } from '../contracts/ride-contracts.js';
import {
  radiusForWave,
  distanceMeters,
  insideArea,
} from '../domain/ride-rules.js';
@Injectable()
export class RideDispatchService {
  constructor(
    @Inject(RideRepository) private readonly repository: RideRepository,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(DriversFacade) private readonly drivers: DriversFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(PricingFacade) private readonly pricing: PricingFacade,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  private async noDriver(
    context: TransactionContext,
    ride: RideRecord,
    reason: string,
  ) {
    await this.finance.releaseFunds(context, ride.reservationId);
    await this.jobs.close(context, ride.id);
    await this.repository.withdrawOffers(context, ride.id);
    await this.repository.transition(
      context,
      ride.id,
      {
        status: 'NO_DRIVER',
        completedAt: new Date(),
        cancellationReason: reason,
      },
      'ride.no_driver',
    );
    await this.audit.record(
      context,
      null,
      'rides.search_ended',
      ride.customerUserId,
    );
  }
  async execute(rideId: string): Promise<void> {
    const claim = await this.repository.claimTask(rideId);
    if (!claim) return;
    try {
      const initial = await this.repository.ride(rideId);
      if (!initial) throw new Error('Dispatch task references missing ride');
      const discovered =
        initial.status === 'SEARCHING' &&
        initial.searchExpiresAt > new Date() &&
        initial.dispatchWave < 3
          ? await this.drivers.candidates(
              {
                latitude: initial.pickupLatitude,
                longitude: initial.pickupLongitude,
              },
              radiusForWave(initial.dispatchWave),
              initial.serviceClass,
              initial.customerUserId,
            )
          : [];
      const free = new Set(
        await this.jobs.freeDriverIds(discovered.map((row) => row.ownerUserId)),
      );
      const oldOffers = await this.transactions.run((context) =>
        this.repository.offersForRide(context, rideId),
      );
      const alreadyOffered = new Set(
        oldOffers.map((offer) => offer.driverUserId),
      );
      const candidates = discovered
        .filter(
          (row) =>
            free.has(row.ownerUserId) && !alreadyOffered.has(row.ownerUserId),
        )
        .slice(0, 10);
      await this.transactions.run(async (context) => {
        await this.identity.lockUsers(context, [
          initial.customerUserId,
          ...candidates.map((row) => row.ownerUserId),
        ]);
        const eligible: string[] = [];
        for (const candidate of [...candidates].sort((a, b) =>
          a.ownerUserId.localeCompare(b.ownerUserId),
        )) {
          try {
            const info = await this.drivers.assertDispatchEligible(
              context,
              candidate.ownerUserId,
              initial.serviceClass,
            );
            const p = info.location;
            if (
              p.latitude !== null &&
              p.longitude !== null &&
              insideArea(initial, {
                latitude: p.latitude,
                longitude: p.longitude,
              }) &&
              distanceMeters(
                {
                  latitude: initial.pickupLatitude,
                  longitude: initial.pickupLongitude,
                },
                { latitude: p.latitude, longitude: p.longitude },
              ) <= radiusForWave(initial.dispatchWave)
            )
              eligible.push(candidate.ownerUserId);
          } catch (error) {
            if (
              !(error instanceof BusinessError) &&
              !(error instanceof ApiError && error.getStatus() === 401)
            )
              throw error;
          }
        }
        await this.jobs.lock(context, rideId);
        await this.repository.lock(context, rideId);
        if (!(await this.repository.ownsTask(context, claim))) return;
        const ride = await this.repository.ride(rideId, context);
        if (!ride) throw new Error('Missing ride');
        if (ride.status !== 'SEARCHING') {
          await this.repository.scheduleTask(context, claim, null);
          return;
        }
        let unavailable: string | null = null;
        try {
          await this.identity.assertAccountActive(context, ride.customerUserId);
          await this.pricing.assertAreaActive(context, ride.serviceAreaId);
        } catch (error) {
          if (!(error instanceof BusinessError)) throw error;
          unavailable = error.code;
        }
        if (ride.searchExpiresAt <= new Date() || unavailable) {
          await this.noDriver(context, ride, unavailable ?? 'SEARCH_EXPIRED');
          await this.repository.scheduleTask(context, claim, null);
          return;
        }
        if (ride.dispatchWave < 3) {
          // Re-sort only for presentation/offer insertion; lock acquisition used UUID order.
          const nearest = candidates
            .filter((row) => eligible.includes(row.ownerUserId))
            .map((row) => row.ownerUserId);
          const radius = radiusForWave(ride.dispatchWave);
          await this.repository.createOffers(
            context,
            ride,
            nearest,
            ride.dispatchWave + 1,
            radius,
          );
          await this.repository.transition(
            context,
            ride.id,
            { dispatchWave: ride.dispatchWave + 1, radiusMeters: radius },
            'ride.dispatch_wave',
          );
        }
        const next =
          ride.dispatchWave >= 2
            ? ride.searchExpiresAt
            : new Date(
                Math.min(Date.now() + 30000, ride.searchExpiresAt.getTime()),
              );
        await this.repository.scheduleTask(context, claim, next);
      });
    } catch {
      // Retry from persisted task/state. A failed worker never assumes that a hold was released.
      await this.transactions.run(async (context) => {
        const initial = await this.repository.ride(rideId, context);
        if (!initial) throw new Error('Missing dispatch ride');
        await this.identity.lockUsers(context, [initial.customerUserId]);
        await this.jobs.lock(context, rideId);
        await this.repository.lock(context, rideId);
        if (!(await this.repository.ownsTask(context, claim))) return;
        const current = await this.repository.ride(rideId, context);
        if (current?.status !== 'SEARCHING') {
          await this.repository.scheduleTask(context, claim, null);
          return;
        }
        const review = claim.attempts >= 8;
        await this.repository.scheduleTask(
          context,
          claim,
          new Date(
            Date.now() +
              Math.min(300000, 1000 * 2 ** Math.min(claim.attempts, 8)) +
              Math.floor(Math.random() * 1000),
          ),
          review,
          true,
        );
        if (review)
          await this.audit.record(
            context,
            null,
            'rides.dispatch_review_required',
            initial.customerUserId,
          );
      });
    }
  }
}
