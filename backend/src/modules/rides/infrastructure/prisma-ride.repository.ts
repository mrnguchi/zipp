import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  RideRecord,
  RidePatch,
  DispatchClaim,
} from '../contracts/ride-contracts.js';
import { RideRepository } from '../application/ride.repository.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class PrismaRideRepository extends RideRepository {
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
  taskInfo(rideId: string) {
    return this.database.client.rideDispatchTask.findUnique({
      where: { rideId },
      select: { reviewRequired: true, availableAt: true, completedAt: true },
    });
  }
  ride(id: string, context?: TransactionContext) {
    return this.client(context).ride.findUnique({ where: { id } });
  }
  async lock(context: TransactionContext, id: string) {
    await this.client(context)
      .$queryRaw`SELECT id FROM rides WHERE id=${id}::uuid FOR UPDATE`;
  }
  async activeCustomerRide(
    context: TransactionContext,
    customerUserId: string,
  ) {
    return (
      (await this.client(context).ride.count({
        where: {
          customerUserId,
          status: { in: ['SEARCHING', 'ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
        },
      })) > 0
    );
  }
  async create(
    context: TransactionContext,
    data: Pick<
      RideRecord,
      | 'id'
      | 'customerUserId'
      | 'quoteId'
      | 'reservationId'
      | 'serviceAreaId'
      | 'serviceClass'
      | 'quotedAmountXaf'
      | 'commissionBps'
      | 'cancellationFeeXaf'
      | 'pickupLatitude'
      | 'pickupLongitude'
      | 'destinationLatitude'
      | 'destinationLongitude'
      | 'distanceMeters'
      | 'durationSeconds'
      | 'pricingPolicyVersion'
    >,
    serviceAreaSnapshot: Record<string, number>,
  ) {
    const row = await this.client(context).ride.create({
      data: {
        ...data,
        serviceAreaSnapshot,
        searchExpiresAt: new Date(Date.now() + 120000),
        task: { create: {} },
      },
    });
    await this.client(context).rideEvent.create({
      data: { rideId: row.id, aggregateVersion: 1, eventType: 'ride.booked' },
    });
    return row;
  }
  async transition(
    context: TransactionContext,
    id: string,
    patch: RidePatch,
    eventType: string,
  ) {
    const row = await this.client(context).ride.update({
      where: { id },
      data: { ...patch, version: { increment: 1 } },
    });
    await this.client(context).rideEvent.create({
      data: { rideId: id, aggregateVersion: row.version, eventType },
    });
    return row;
  }
  async security(context: TransactionContext, id: string, patch: RidePatch) {
    await this.client(context).ride.update({ where: { id }, data: patch });
  }
  request(
    context: TransactionContext,
    actorUserId: string,
    action: string,
    requestKey: string,
  ) {
    return this.client(context).rideRequest.findUnique({
      where: {
        actorUserId_action_requestKey: { actorUserId, action, requestKey },
      },
    });
  }
  async remember(
    context: TransactionContext,
    actorUserId: string,
    action: string,
    requestKey: string,
    requestFingerprint: string,
    rideId: string,
    reason?: string,
  ) {
    await this.client(context).rideRequest.create({
      data: {
        actorUserId,
        action,
        requestKey,
        requestFingerprint,
        rideId,
        requestReason: reason ?? null,
      },
    });
  }
  offer(id: string, context?: TransactionContext) {
    return this.client(context).rideOffer.findUnique({ where: { id } });
  }
  async createOffers(
    context: TransactionContext,
    ride: RideRecord,
    driverIds: string[],
    wave: number,
    radiusMeters: number,
  ) {
    const now = Date.now();
    await this.client(context).rideOffer.updateMany({
      where: {
        rideId: ride.id,
        status: 'OFFERED',
        expiresAt: { lte: new Date(now) },
      },
      data: { status: 'EXPIRED' },
    });
    await this.client(context).rideOffer.createMany({
      data: driverIds.map((driverUserId) => ({
        rideId: ride.id,
        driverUserId,
        wave,
        radiusMeters,
        expiresAt: new Date(
          Math.min(now + 30000, ride.searchExpiresAt.getTime()),
        ),
      })),
      skipDuplicates: true,
    });
  }
  offersForRide(context: TransactionContext, rideId: string) {
    return this.client(context).rideOffer.findMany({
      where: { rideId },
      take: 30,
    });
  }
  async respondOffer(
    context: TransactionContext,
    id: string,
    status: 'ACCEPTED' | 'DECLINED',
  ) {
    await this.client(context).rideOffer.update({
      where: { id },
      data: { status },
    });
  }
  async withdrawOffers(
    context: TransactionContext,
    rideId: string,
    acceptedId?: string,
  ) {
    await this.client(context).rideOffer.updateMany({
      where: {
        rideId,
        status: 'OFFERED',
        ...(acceptedId ? { id: { not: acceptedId } } : {}),
      },
      data: { status: 'WITHDRAWN' },
    });
  }
  driverOffers(driverUserId: string) {
    return this.database.client.rideOffer.findMany({
      where: {
        driverUserId,
        status: 'OFFERED',
        expiresAt: { gt: new Date() },
        ride: { status: 'SEARCHING' },
      },
      include: { ride: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }
  async history(userId: string, limit: number, cursor?: string) {
    const owner = {
      OR: [{ customerUserId: userId }, { driverUserId: userId }],
    };
    const boundary = cursor
      ? await this.database.client.ride.findFirst({
          where: { id: cursor, ...owner },
          select: { createdAt: true, id: true },
        })
      : null;
    if (cursor && !boundary)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Restart pagination with a current cursor',
      );
    return this.database.client.ride.findMany({
      where: {
        ...owner,
        ...(boundary
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: boundary.createdAt } },
                    { createdAt: boundary.createdAt, id: { lt: boundary.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
  active(userId: string) {
    return this.database.client.ride.findMany({
      where: {
        OR: [{ customerUserId: userId }, { driverUserId: userId }],
        status: { in: ['SEARCHING', 'ASSIGNED', 'ARRIVED', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }
  events(rideId: string, afterVersion: number) {
    return this.database.client.rideEvent.findMany({
      where: { rideId, aggregateVersion: { gt: afterVersion } },
      orderBy: { aggregateVersion: 'asc' },
      take: 50,
    });
  }
  async rate(
    context: TransactionContext,
    ride: RideRecord,
    stars: number,
    comment?: string,
  ) {
    const existing = await this.client(context).rideRating.findUnique({
      where: { rideId: ride.id },
    });
    if (existing) {
      if (existing.stars !== stars || existing.comment !== (comment ?? null))
        throw new BusinessError(
          'IDEMPOTENCY_CONFLICT',
          'Ride already has a different rating',
        );
      return;
    }
    if (!ride.driverUserId) throw new Error('Completed ride has no driver');
    await this.client(context).rideRating.create({
      data: {
        rideId: ride.id,
        customerUserId: ride.customerUserId,
        driverUserId: ride.driverUserId,
        stars,
        comment: comment ?? null,
      },
    });
  }
  rating(rideId: string) {
    return this.database.client.rideRating.findUnique({
      where: { rideId },
      select: { stars: true, comment: true, createdAt: true },
    });
  }
  dispute(rideId: string, context?: TransactionContext) {
    return this.client(context).rideDispute.findUnique({ where: { rideId } });
  }
  async openDispute(
    context: TransactionContext,
    rideId: string,
    openedById: string,
    reason: string,
  ) {
    const previous = await this.dispute(rideId, context);
    if (previous) {
      if (previous.openedById !== openedById || previous.reason !== reason)
        throw new BusinessError(
          'IDEMPOTENCY_CONFLICT',
          'Ride already has a dispute',
        );
      return;
    }
    await this.client(context).rideDispute.create({
      data: { rideId, openedById, reason },
    });
  }
  async resolveDispute(
    context: TransactionContext,
    rideId: string,
    resolvedById: string,
    resolution: 'release' | 'refund',
    resolutionReason: string,
  ) {
    await this.client(context).rideDispute.update({
      where: { rideId },
      data: {
        resolution,
        resolutionReason,
        resolvedById,
        resolvedAt: new Date(),
      },
    });
  }
  async dueTasks(limit: number) {
    const now = new Date();
    return (
      await this.database.client.rideDispatchTask.findMany({
        where: {
          completedAt: null,
          reviewRequired: false,
          availableAt: { lte: now },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        orderBy: { availableAt: 'asc' },
        take: limit,
        select: { rideId: true },
      })
    ).map((row) => row.rideId);
  }
  async claimTask(rideId: string) {
    const leaseToken = randomUUID(),
      now = new Date();
    const claimed = await this.database.client.rideDispatchTask.updateMany({
      where: {
        rideId,
        completedAt: null,
        reviewRequired: false,
        availableAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
      },
      data: {
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + 30000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return null;
    const row = await this.database.client.rideDispatchTask.findUniqueOrThrow({
      where: { rideId },
    });
    return { rideId, leaseToken, attempts: row.attempts };
  }
  async ownsTask(context: TransactionContext, claim: DispatchClaim) {
    const rows = await this.client(context).$queryRaw<
      { lease_token: string | null; lease_expires_at: Date | null }[]
    >`SELECT lease_token,lease_expires_at FROM ride_dispatch_tasks WHERE ride_id=${claim.rideId}::uuid FOR UPDATE`;
    return (
      rows[0]?.lease_token === claim.leaseToken &&
      !!rows[0].lease_expires_at &&
      rows[0].lease_expires_at > new Date()
    );
  }
  async scheduleTask(
    context: TransactionContext,
    claim: DispatchClaim,
    availableAt: Date | null,
    reviewRequired = false,
    failed = false,
  ) {
    await this.client(context).rideDispatchTask.updateMany({
      where: { rideId: claim.rideId, leaseToken: claim.leaseToken },
      data: {
        leaseToken: null,
        leaseExpiresAt: null,
        reviewRequired,
        completedAt: availableAt === null ? new Date() : null,
        ...(availableAt ? { availableAt } : {}),
        ...(!failed ? { attempts: 0 } : {}),
      },
    });
  }
  async stopTask(context: TransactionContext, rideId: string) {
    await this.client(context).rideDispatchTask.updateMany({
      where: { rideId },
      data: { completedAt: new Date(), leaseToken: null, leaseExpiresAt: null },
    });
  }
  async retryTask(context: TransactionContext, rideId: string) {
    await this.client(context).rideDispatchTask.update({
      where: { rideId },
      data: {
        reviewRequired: false,
        attempts: 0,
        availableAt: new Date(),
        completedAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  }
}
