import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { DeliveryRequestService } from './delivery-request.service.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { DeliveriesConfig } from '../deliveries.config.js';
import type { BookDeliveryInput } from '../contracts/delivery.schemas.js';
import { assertPackageWeight } from '../domain/delivery-rules.js';
@Injectable()
export class DeliveryBookingService {
  constructor(
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
    @Inject(DeliveryRequestService)
    private readonly requests: DeliveryRequestService,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(PricingFacade) private readonly pricing: PricingFacade,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {}
  async book(a: Actor, key: string, input: BookDeliveryInput) {
    this.config.assertEnabled();
    assertPackageWeight(input.package.size, input.package.weightGrams);
    // Distinct contact phones keep PICKUP/RETURN codes (sender) and HANDOVER codes
    // (recipient) with different people, so one phone cannot prove both custody ends.
    if (input.sender.phone === input.recipient.phone)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Sender and recipient must use different phone numbers',
      );
    const fingerprint = this.requests.fingerprint([
      input.quoteId.toLowerCase(),
      input.perspective,
      input.sender.name,
      input.sender.phone,
      input.recipient.name,
      input.recipient.phone,
      input.package.description,
      input.package.size,
      input.package.weightGrams,
      input.package.photoId.toLowerCase(),
      true,
      true,
    ]);
    await this.limiter.consume([
      {
        key: `delivery-book:${this.identity.pseudonym('actor', a.userId)}`,
        limit: 5,
        windowMs: 60000,
      },
    ]);
    return this.tx.run(async (c) => {
      // Resolve both contacts before acquiring sorted identity locks, then recheck binding.
      const sender = await this.identity.verifiedPhoneOwner(
          c,
          input.sender.phone,
        ),
        recipient = await this.identity.verifiedPhoneOwner(
          c,
          input.recipient.phone,
        );
      await this.identity.authorize(c, a, [], false, [
        ...(sender ? [sender] : []),
        ...(recipient ? [recipient] : []),
      ]);
      const replay = await this.requests.replay(
        c,
        a.userId,
        'BOOK',
        key,
        fingerprint,
      );
      if (replay) return replay;
      if (
        (await this.identity.actorPhone(c, a)) !==
        (input.perspective === 'SENDING'
          ? input.sender.phone
          : input.recipient.phone)
      )
        throw new BusinessError(
          'VALIDATION_ERROR',
          'Your verified phone must match your selected contact role',
        );
      if (
        sender !==
          (await this.identity.verifiedPhoneOwner(c, input.sender.phone)) ||
        recipient !==
          (await this.identity.verifiedPhoneOwner(c, input.recipient.phone))
      )
        throw new BusinessError(
          'DELIVERY_STATE_CHANGED',
          'Contact changed; retry booking',
        );
      if ((await this.repo.activeBookerCount(c, a.userId)) >= 3)
        throw new BusinessError(
          'ACTIVE_DELIVERY_LIMIT',
          'Finish or cancel an active delivery first',
        );
      const id = randomUUID(),
        quote = await this.pricing.consumeQuote(
          c,
          a,
          input.quoteId.toLowerCase(),
          `delivery:${id}`,
        );
      if (
        !['DELIVERY_STANDARD', 'DELIVERY_EXPRESS'].includes(quote.serviceClass)
      )
        throw new BusinessError(
          'VALIDATION_ERROR',
          'A delivery quote is required',
        );
      const terms = await this.pricing.bookingTerms(c, quote.id);
      await this.repo.lockPhoto(c, input.package.photoId);
      const photo = await this.repo.photo(input.package.photoId, c);
      if (
        !photo ||
        photo.ownerUserId !== a.userId ||
        photo.status !== 'STORED' ||
        Date.now() - photo.createdAt.getTime() > 86400000 ||
        (await this.repo.photoUsed(photo.id, c))
      )
        throw new BusinessError(
          'VALIDATION_ERROR',
          'An unused recent package photo is required',
        );
      await this.jobs.create(c, id, a.userId, 'DELIVERY');
      const held = await this.finance.reserveFunds(
        c,
        a,
        `delivery:${id}`,
        quote.totalAmountXaf.toString(),
      );
      const area = terms.serviceArea;
      const row = await this.repo.create(
        c,
        {
          id,
          bookerUserId: a.userId,
          senderUserId: sender,
          recipientUserId: recipient,
          quoteId: quote.id,
          reservationId: held.id,
          serviceAreaId: area.id,
          serviceClass: quote.serviceClass,
          quotedAmountXaf: quote.totalAmountXaf,
          commissionBps: terms.commissionBps,
          cancellationFeeXaf: terms.cancellationFeeXaf,
          pricingPolicyVersion: terms.version,
          pickupLatitude: quote.pickupLatitude,
          pickupLongitude: quote.pickupLongitude,
          destinationLatitude: quote.destinationLatitude,
          destinationLongitude: quote.destinationLongitude,
          distanceMeters: quote.distanceMeters,
          durationSeconds: quote.durationSeconds,
        },
        input,
        {
          minimumLatitude: area.minimumLatitude,
          maximumLatitude: area.maximumLatitude,
          minimumLongitude: area.minimumLongitude,
          maximumLongitude: area.maximumLongitude,
        },
      );
      await this.repo.remember(c, a.userId, 'BOOK', key, fingerprint, id);
      await this.audit.record(c, a.userId, 'deliveries.booked');
      return row;
    });
  }
}
