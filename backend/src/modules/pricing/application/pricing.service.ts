import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { IdentityFacade } from '../../identity/identity.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { PricingRepository } from './pricing.repository.js';
import { RoutingProvider } from './routing.port.js';
import { PricingConfig } from '../pricing.config.js';
import type {
  QuoteInput,
  AreaInput,
  PolicyInput,
} from '../contracts/pricing.schemas.js';
import type {
  QuoteRecord,
  PolicyRecord,
} from '../contracts/pricing-contracts.js';
import { fareForRoute, withinArea } from '../domain/fare.js';

export const quoteView = (row: QuoteRecord) => ({
  id: row.id,
  serviceClass: row.serviceClass,
  currency: 'XAF',
  totalAmountXaf: row.totalAmountXaf.toString(),
  pickup: { latitude: row.pickupLatitude, longitude: row.pickupLongitude },
  destination: {
    latitude: row.destinationLatitude,
    longitude: row.destinationLongitude,
  },
  distanceMeters: row.distanceMeters,
  durationSeconds: row.durationSeconds,
  routeVersion: row.routeVersion,
  pricingPolicyId: row.pricingPolicyId,
  policy: row.policySnapshot,
  expiresAt: row.expiresAt,
  consumed: row.consumedAt !== null,
  createdAt: row.createdAt,
});
export const policyView = (row: PolicyRecord) => ({
  id: row.id,
  serviceAreaId: row.serviceAreaId,
  version: row.version,
  serviceClass: row.serviceClass,
  baseFareXaf: row.baseFareXaf.toString(),
  perKilometerXaf: row.perKilometerXaf.toString(),
  perMinuteXaf: row.perMinuteXaf.toString(),
  minimumFareXaf: row.minimumFareXaf.toString(),
  nightMultiplierBps: row.nightMultiplierBps,
  commissionBps: row.commissionBps,
  cancellationFeeXaf: row.cancellationFeeXaf.toString(),
  active: row.active,
});

@Injectable()
export class PricingService {
  constructor(
    @Inject(PricingRepository) private readonly repository: PricingRepository,
    @Inject(RoutingProvider) private readonly routing: RoutingProvider,
    @Inject(PricingConfig) private readonly config: PricingConfig,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  private replay(row: QuoteRecord, fingerprint: string) {
    if (row.requestFingerprint !== fingerprint)
      throw new BusinessError(
        'IDEMPOTENCY_CONFLICT',
        'Quote key has different input',
      );
    if (row.expiresAt <= new Date() && !row.consumedAt)
      throw new BusinessError(
        'QUOTE_EXPIRED',
        'Create a new quote with a new request key',
      );
    return row;
  }
  async create(actor: Actor, key: string, input: QuoteInput) {
    this.config.assertEnabled();
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          input.serviceAreaId,
          input.serviceClass,
          input.pickup.latitude,
          input.pickup.longitude,
          input.destination.latitude,
          input.destination.longitude,
        ]),
      )
      .digest('hex');
    const existing = await this.repository.byRequest(actor.userId, key);
    if (existing)
      return this.transactions.run(async (context) => {
        await this.identity.authorize(context, actor);
        return this.replay(existing, fingerprint);
      });
    const original = await this.repository.policy(
      input.serviceAreaId,
      input.serviceClass,
    );
    if (
      !original ||
      !original.area.active ||
      !withinArea(original.area, input.pickup) ||
      !withinArea(original.area, input.destination)
    )
      throw new BusinessError(
        'SERVICE_AREA_UNAVAILABLE',
        'Service is unavailable for these endpoints',
      );
    // Route lookup never occurs inside a database transaction. Never fall back to client distance.
    const route = await this.routing.route(input);
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      await this.repository.lockArea(context, input.serviceAreaId);
      const previous = await this.repository.byRequest(
        actor.userId,
        key,
        context,
      );
      if (previous) return this.replay(previous, fingerprint);
      const policy = await this.repository.policy(
        input.serviceAreaId,
        input.serviceClass,
        context,
      );
      if (!policy || policy.id !== original.id || !policy.area.active)
        throw new BusinessError(
          'PRICING_POLICY_CHANGED',
          'Pricing changed; request a new quote',
        );
      const result = fareForRoute(
        policy,
        route.distanceMeters,
        route.durationSeconds,
        new Date(),
      );
      const quote = await this.repository.createQuote(
        context,
        actor.userId,
        key,
        fingerprint,
        input,
        policy,
        route,
        result.totalAmountXaf,
        {
          version: policy.version,
          baseFareXaf: policy.baseFareXaf.toString(),
          perKilometerXaf: policy.perKilometerXaf.toString(),
          perMinuteXaf: policy.perMinuteXaf.toString(),
          minimumFareXaf: policy.minimumFareXaf.toString(),
          nightMultiplierBps: policy.nightMultiplierBps,
          commissionBps: policy.commissionBps,
          cancellationFeeXaf: policy.cancellationFeeXaf.toString(),
          night: result.night,
          timeZone: 'Africa/Douala',
          developmentOnly: policy.area.developmentOnly,
        },
      );
      await this.audit.record(context, actor.userId, 'pricing.quote_created');
      return quote;
    });
  }
  async get(actor: Actor, id: string) {
    const row = await this.repository.quote(id);
    if (!row || row.ownerUserId !== actor.userId)
      throw new BusinessError('NOT_FOUND', 'Quote not found');
    return row;
  }
  async bookingTerms(context: TransactionContext, quoteId: string) {
    const quote = await this.repository.quote(quoteId, context);
    const policy = quote
      ? await this.repository.policyForQuote(quote.pricingPolicyId, context)
      : null;
    if (!quote || !policy)
      throw new BusinessError('NOT_FOUND', 'Quote policy not found');
    return {
      serviceArea: policy.area,
      commissionBps: policy.commissionBps,
      cancellationFeeXaf: policy.cancellationFeeXaf,
      version: policy.version,
    };
  }
  async assertAreaActive(context: TransactionContext, id: string) {
    await this.repository.lockArea(context, id);
    const area = await this.repository.area(context, id);
    if (!area?.active)
      throw new BusinessError(
        'SERVICE_AREA_UNAVAILABLE',
        'Service area is not active',
      );
  }
  async consume(
    context: TransactionContext,
    actor: Actor,
    id: string,
    bookingKey: string,
  ) {
    this.config.assertEnabled();
    if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(bookingKey))
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Invalid booking operation identity',
      );
    await this.identity.authorize(context, actor);
    const initial = await this.repository.quote(id, context);
    if (!initial || initial.ownerUserId !== actor.userId)
      throw new BusinessError('NOT_FOUND', 'Quote not found');
    const policy = await this.repository.policyForQuote(
      initial.pricingPolicyId,
      context,
    );
    if (!policy)
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Quote policy is unavailable',
      );
    await this.repository.lockArea(context, policy.serviceAreaId);
    await this.repository.lockQuote(context, id);
    const quote = await this.repository.quote(id, context);
    if (!quote) throw new BusinessError('NOT_FOUND', 'Quote not found');
    if (quote.consumedByKey) {
      if (quote.consumedByKey !== bookingKey)
        throw new BusinessError(
          'QUOTE_ALREADY_CONSUMED',
          'Quote is already used',
        );
      return quote;
    }
    const current = await this.repository.policy(
      policy.serviceAreaId,
      quote.serviceClass,
      context,
    );
    if (quote.expiresAt <= new Date())
      throw new BusinessError('QUOTE_EXPIRED', 'Request a new quote');
    if (!current || current.id !== policy.id || !current.area.active)
      throw new BusinessError(
        'PRICING_POLICY_CHANGED',
        'Quote policy is no longer active',
      );
    await this.repository.consume(context, id, bookingKey);
    return quote;
  }
  async createArea(actor: Actor, input: AreaInput) {
    if (
      input.minimumLatitude >= input.maximumLatitude ||
      input.minimumLongitude >= input.maximumLongitude
    )
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Service area bounds are invalid',
      );
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor, ['ADMIN'], true);
      const row = await this.repository.createArea(context, input);
      await this.audit.record(
        context,
        actor.userId,
        'pricing.service_area_created',
      );
      return row;
    });
  }
  async activateArea(actor: Actor, id: string, active: boolean) {
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor, ['ADMIN'], true);
      await this.repository.lockArea(context, id);
      if (!(await this.repository.area(context, id)))
        throw new BusinessError('NOT_FOUND', 'Service area not found');
      await this.repository.activateArea(context, id, active);
      await this.audit.record(
        context,
        actor.userId,
        active
          ? 'pricing.service_area_activated'
          : 'pricing.service_area_disabled',
      );
    });
  }
  async publish(actor: Actor, input: PolicyInput) {
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor, ['ADMIN'], true);
      await this.repository.lockArea(context, input.serviceAreaId);
      if (!(await this.repository.area(context, input.serviceAreaId)))
        throw new BusinessError('NOT_FOUND', 'Service area not found');
      const policy = await this.repository.publish(
        context,
        actor.userId,
        input,
      );
      await this.audit.record(
        context,
        actor.userId,
        'pricing.policy_published',
      );
      return policy;
    });
  }
}
