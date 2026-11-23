import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
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
import type { DeliveryRecord } from '../contracts/delivery-contracts.js';
import {
  deliveryRadius,
  proximityMeters,
  inDeliveryArea,
} from '../domain/delivery-rules.js';
@Injectable()
export class DeliveryDispatchService {
  constructor(
    @Inject(DeliveryRepository) private readonly repository: DeliveryRepository,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(DriversFacade) private readonly drivers: DriversFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(PricingFacade) private readonly pricing: PricingFacade,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  private async noCourier(
    context: TransactionContext,
    delivery: DeliveryRecord,
    reason: string,
  ) {
    await this.finance.releaseFunds(context, delivery.reservationId);
    await this.jobs.close(context, delivery.id);
    await this.repository.withdrawOffers(context, delivery.id);
    await this.repository.transition(
      context,
      delivery.id,
      {
        status: 'NO_COURIER',
        completedAt: new Date(),
        cancellationReason: reason,
      },
      'delivery.no_driver',
    );
    await this.audit.record(
      context,
      null,
      'deliveries.search_ended',
      delivery.bookerUserId,
    );
  }
  async execute(deliveryId: string): Promise<void> {
    const claim = await this.repository.claimTask(deliveryId);
    if (!claim) return;
    try {
      const initial = await this.repository.get(deliveryId);
      if (!initial)
        throw new Error('Dispatch task references missing delivery');
      const discovered =
        initial.status === 'SEARCHING' &&
        initial.searchExpiresAt > new Date() &&
        initial.dispatchWave < 3
          ? await this.drivers.candidates(
              {
                latitude: initial.pickupLatitude,
                longitude: initial.pickupLongitude,
              },
              deliveryRadius(initial.dispatchWave),
              initial.serviceClass,
              initial.bookerUserId,
            )
          : [];
      const free = new Set(
        await this.jobs.freeDriverIds(discovered.map((row) => row.ownerUserId)),
      );
      const oldOffers = await this.transactions.run((context) =>
        this.repository.offers(context, deliveryId),
      );
      const alreadyOffered = new Set(
        oldOffers.map((offer) => offer.courierUserId),
      );
      const candidates = discovered
        .filter(
          (row) =>
            free.has(row.ownerUserId) &&
            !alreadyOffered.has(row.ownerUserId) &&
            row.ownerUserId !== initial.senderUserId &&
            row.ownerUserId !== initial.recipientUserId,
        )
        .slice(0, 10);
      await this.transactions.run(async (context) => {
        await this.identity.lockUsers(context, [
          initial.bookerUserId,
          ...[initial.senderUserId, initial.recipientUserId].filter(
            (v): v is string => !!v,
          ),
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
              await this.identity.hasVerifiedPhone(
                context,
                candidate.ownerUserId,
                [initial.senderPhone, initial.recipientPhone],
              )
            )
              continue;
            if (
              p.latitude !== null &&
              p.longitude !== null &&
              inDeliveryArea(initial, {
                latitude: p.latitude,
                longitude: p.longitude,
              }) &&
              proximityMeters(
                {
                  latitude: initial.pickupLatitude,
                  longitude: initial.pickupLongitude,
                },
                { latitude: p.latitude, longitude: p.longitude },
              ) <= deliveryRadius(initial.dispatchWave)
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
        await this.jobs.lock(context, deliveryId);
        await this.repository.lock(context, deliveryId);
        if (!(await this.repository.ownsTask(context, claim))) return;
        const delivery = await this.repository.get(deliveryId, context);
        if (!delivery) throw new Error('Missing delivery');
        if (
          delivery.senderUserId !== initial.senderUserId ||
          delivery.recipientUserId !== initial.recipientUserId
        )
          throw new BusinessError(
            'DELIVERY_STATE_CHANGED',
            'Contact changed during dispatch',
          );
        if (delivery.status !== 'SEARCHING') {
          await this.repository.scheduleTask(context, claim, null);
          return;
        }
        let unavailable: string | null = null;
        try {
          await this.identity.assertAccountActive(
            context,
            delivery.bookerUserId,
          );
          await this.pricing.assertAreaActive(context, delivery.serviceAreaId);
        } catch (error) {
          if (!(error instanceof BusinessError)) throw error;
          unavailable = error.code;
        }
        if (delivery.searchExpiresAt <= new Date() || unavailable) {
          await this.noCourier(
            context,
            delivery,
            unavailable ?? 'SEARCH_EXPIRED',
          );
          await this.repository.scheduleTask(context, claim, null);
          return;
        }
        if (delivery.dispatchWave < 3) {
          // Re-sort only for presentation/offer insertion; lock acquisition used UUID order.
          const nearest = candidates
            .filter((row) => eligible.includes(row.ownerUserId))
            .map((row) => row.ownerUserId);
          const radius = deliveryRadius(delivery.dispatchWave);
          await this.repository.createOffers(
            context,
            delivery,
            nearest,
            delivery.dispatchWave + 1,
            radius,
          );
          await this.repository.transition(
            context,
            delivery.id,
            { dispatchWave: delivery.dispatchWave + 1, radiusMeters: radius },
            'delivery.dispatch_wave',
          );
        }
        const next =
          delivery.dispatchWave >= 2
            ? delivery.searchExpiresAt
            : new Date(
                Math.min(
                  Date.now() + 30000,
                  delivery.searchExpiresAt.getTime(),
                ),
              );
        await this.repository.scheduleTask(context, claim, next);
      });
    } catch {
      // Retry from persisted task/state. A failed worker never assumes that a hold was released.
      await this.transactions.run(async (context) => {
        const initial = await this.repository.get(deliveryId, context);
        if (!initial) throw new Error('Missing dispatch delivery');
        await this.identity.lockUsers(context, [initial.bookerUserId]);
        await this.jobs.lock(context, deliveryId);
        await this.repository.lock(context, deliveryId);
        if (!(await this.repository.ownsTask(context, claim))) return;
        const current = await this.repository.get(deliveryId, context);
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
            'deliveries.dispatch_review_required',
            initial.bookerUserId,
          );
      });
    }
  }
}
