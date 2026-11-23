import { Inject, Injectable } from '@nestjs/common';
import { PricingService } from './application/pricing.service.js';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../shared/contracts/actor.js';
@Injectable()
export class PricingFacade {
  constructor(
    @Inject(PricingService) private readonly pricing: PricingService,
  ) {}
  /** Call in the booking/hold transaction; caller must bind booking ownership and service. */
  consumeQuote(
    context: TransactionContext,
    actor: Actor,
    quoteId: string,
    bookingKey: string,
  ) {
    return this.pricing.consume(context, actor, quoteId, bookingKey);
  }
  bookingTerms(context: TransactionContext, quoteId: string) {
    return this.pricing.bookingTerms(context, quoteId);
  }
  assertAreaActive(context: TransactionContext, id: string) {
    return this.pricing.assertAreaActive(context, id);
  }
}
