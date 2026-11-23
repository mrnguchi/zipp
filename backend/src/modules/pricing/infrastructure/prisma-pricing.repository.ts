import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { PricingRepository } from '../application/pricing.repository.js';
import type {
  AreaInput,
  PolicyInput,
  QuoteInput,
} from '../contracts/pricing.schemas.js';
import type {
  PolicyRecord,
  RouteResult,
} from '../contracts/pricing-contracts.js';
@Injectable()
export class PrismaPricingRepository extends PricingRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(DatabaseUnitOfWork)
    private readonly transactions: DatabaseUnitOfWork,
  ) {
    super();
  }
  private client(context?: TransactionContext) {
    return context ? this.transactions.client(context) : this.database.client;
  }
  policyForQuote(id: string, context: TransactionContext) {
    return this.client(context).pricingPolicy.findUnique({
      where: { id },
      include: { area: true },
    });
  }
  policy(
    serviceAreaId: string,
    serviceClass: QuoteInput['serviceClass'],
    context?: TransactionContext,
  ) {
    return this.client(context).pricingPolicy.findFirst({
      where: { serviceAreaId, serviceClass, active: true },
      include: { area: true },
    });
  }
  async lockArea(context: TransactionContext, id: string) {
    await this.client(context)
      .$queryRaw`SELECT id FROM service_areas WHERE id=${id}::uuid FOR UPDATE`;
  }
  areas() {
    return this.database.client.serviceArea.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      take: 50,
    });
  }
  area(context: TransactionContext, id: string) {
    return this.client(context).serviceArea.findUnique({ where: { id } });
  }
  createArea(context: TransactionContext, input: AreaInput) {
    return this.client(context).serviceArea.create({
      data: { ...input, developmentOnly: true },
    });
  }
  async activateArea(context: TransactionContext, id: string, active: boolean) {
    await this.client(context).serviceArea.update({
      where: { id },
      data: { active },
    });
  }
  async publish(
    context: TransactionContext,
    createdById: string,
    input: PolicyInput,
  ) {
    const client = this.client(context);
    await client.pricingPolicy.updateMany({
      where: {
        serviceAreaId: input.serviceAreaId,
        serviceClass: input.serviceClass,
        active: true,
      },
      data: { active: false },
    });
    return client.pricingPolicy.create({
      data: {
        ...input,
        createdById,
        baseFareXaf: BigInt(input.baseFareXaf),
        perKilometerXaf: BigInt(input.perKilometerXaf),
        perMinuteXaf: BigInt(input.perMinuteXaf),
        minimumFareXaf: BigInt(input.minimumFareXaf),
        cancellationFeeXaf: BigInt(input.cancellationFeeXaf),
      },
      include: { area: true },
    });
  }
  byRequest(
    ownerUserId: string,
    requestKey: string,
    context?: TransactionContext,
  ) {
    return this.client(context).priceQuote.findUnique({
      where: { ownerUserId_requestKey: { ownerUserId, requestKey } },
    });
  }
  quote(id: string, context?: TransactionContext) {
    return this.client(context).priceQuote.findUnique({ where: { id } });
  }
  createQuote(
    context: TransactionContext,
    ownerUserId: string,
    requestKey: string,
    requestFingerprint: string,
    input: QuoteInput,
    policy: PolicyRecord,
    route: RouteResult,
    totalAmountXaf: bigint,
    policySnapshot: Record<string, string | number | boolean>,
  ) {
    return this.client(context).priceQuote.create({
      data: {
        ownerUserId,
        requestKey,
        requestFingerprint,
        pricingPolicyId: policy.id,
        serviceClass: input.serviceClass,
        pickupLatitude: input.pickup.latitude,
        pickupLongitude: input.pickup.longitude,
        destinationLatitude: input.destination.latitude,
        destinationLongitude: input.destination.longitude,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        routeVersion: route.version,
        routeFingerprint: route.fingerprint,
        totalAmountXaf,
        policySnapshot,
        expiresAt: new Date(Date.now() + 120_000),
      },
    });
  }
  async lockQuote(context: TransactionContext, id: string) {
    await this.client(context)
      .$queryRaw`SELECT id FROM price_quotes WHERE id=${id}::uuid FOR UPDATE`;
  }
  async consume(context: TransactionContext, id: string, bookingKey: string) {
    await this.client(context).priceQuote.update({
      where: { id },
      data: { consumedByKey: bookingKey, consumedAt: new Date() },
    });
  }
}
