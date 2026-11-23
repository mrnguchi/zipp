import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { DeliveryRequestService } from './delivery-request.service.js';
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
import { DeliveriesConfig } from '../deliveries.config.js';
import {
  hasParticipant,
  proximityMeters,
  inDeliveryArea,
} from '../domain/delivery-rules.js';
@Injectable()
export class DeliveryOfferService {
  constructor(
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
    @Inject(DeliveryRequestService)
    private readonly requests: DeliveryRequestService,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(DriversFacade) private readonly drivers: DriversFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(PricingFacade) private readonly pricing: PricingFacade,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {}
  async list(a: Actor) {
    this.config.assertEnabled();
    await this.tx.run((c) => this.identity.authorize(c, a, ['DRIVER']));
    return {
      items: (await this.repo.courierOffers(a.userId)).map((o) => ({
        id: o.id,
        deliveryId: o.deliveryId,
        expiresAt: o.expiresAt,
        serviceClass: o.delivery.serviceClass,
        pickup: {
          latitude: o.delivery.pickupLatitude,
          longitude: o.delivery.pickupLongitude,
        },
        packageSize: o.delivery.packageSize,
        packageWeightGrams: o.delivery.packageWeightGrams,
        quotedAmountXaf: o.delivery.quotedAmountXaf.toString(),
      })),
    };
  }
  async respond(a: Actor, key: string, id: string, accept: boolean) {
    this.config.assertEnabled();
    const action = accept ? 'ACCEPT_OFFER' : 'DECLINE_OFFER',
      fp = this.requests.fingerprint([id]);
    return this.tx.run(async (c) => {
      const original = await this.repo.offer(id, c);
      if (!original || original.courierUserId !== a.userId)
        throw new BusinessError('NOT_FOUND', 'Offer not found');
      const initial = await this.repo.get(original.deliveryId, c);
      if (!initial) throw new BusinessError('NOT_FOUND', 'Offer not found');
      await this.identity.authorize(c, a, accept ? ['DRIVER'] : [], false, [
        initial.bookerUserId,
        ...[initial.senderUserId, initial.recipientUserId].filter(
          (v): v is string => !!v,
        ),
      ]);
      const replay = await this.requests.replay(c, a.userId, action, key, fp);
      if (replay)
        return {
          deliveryId: replay.id,
          status: accept ? 'ACCEPTED' : 'DECLINED',
        };
      const position = accept
        ? await this.drivers.assertDispatchEligible(
            c,
            a.userId,
            initial.serviceClass,
          )
        : null;
      await this.jobs.lock(c, initial.id);
      await this.repo.lock(c, initial.id);
      const d = await this.repo.get(initial.id, c),
        offer = await this.repo.offer(id, c);
      if (!d || !offer || d.status !== 'SEARCHING')
        throw new BusinessError(
          'DELIVERY_ALREADY_ASSIGNED',
          'Delivery is no longer available',
        );
      if (
        d.senderUserId !== initial.senderUserId ||
        d.recipientUserId !== initial.recipientUserId
      )
        throw new BusinessError(
          'DELIVERY_STATE_CHANGED',
          'Contact changed; retry the same request',
        );
      if (
        offer.status !== 'OFFERED' ||
        offer.expiresAt <= new Date() ||
        d.searchExpiresAt <= new Date()
      )
        throw new BusinessError('OFFER_EXPIRED', 'Offer has expired');
      if (accept) {
        if (
          hasParticipant(d, a.userId) ||
          (await this.identity.hasVerifiedPhone(c, a.userId, [
            d.senderPhone,
            d.recipientPhone,
          ]))
        )
          throw new BusinessError(
            'FORBIDDEN',
            'Delivery contacts cannot accept their own delivery',
          );
        await this.identity.assertAccountActive(c, d.bookerUserId);
        await this.pricing.assertAreaActive(c, d.serviceAreaId);
        const p = position?.location;
        if (
          p?.latitude == null ||
          p.longitude == null ||
          !inDeliveryArea(d, {
            latitude: p.latitude,
            longitude: p.longitude,
          }) ||
          proximityMeters(
            { latitude: p.latitude, longitude: p.longitude },
            { latitude: d.pickupLatitude, longitude: d.pickupLongitude },
          ) > offer.radiusMeters
        )
          throw new BusinessError(
            'DRIVER_NOT_ELIGIBLE',
            'Courier is outside the offered pickup area',
          );
        await this.jobs.claim(c, d.id, a.userId);
        await this.repo.respondOffer(c, id, 'ACCEPTED');
        await this.repo.withdrawOffers(c, d.id, id);
        await this.repo.stopTask(c, d.id);
        await this.repo.transition(
          c,
          d.id,
          {
            status: 'ASSIGNED',
            courierUserId: a.userId,
            assignedAt: new Date(),
          },
          'delivery.assigned',
        );
      } else await this.repo.respondOffer(c, id, 'DECLINED');
      await this.repo.remember(c, a.userId, action, key, fp, d.id);
      await this.audit.record(
        c,
        a.userId,
        accept ? 'deliveries.offer_accepted' : 'deliveries.offer_declined',
      );
      return { deliveryId: d.id, status: accept ? 'ACCEPTED' : 'DECLINED' };
    });
  }
}
