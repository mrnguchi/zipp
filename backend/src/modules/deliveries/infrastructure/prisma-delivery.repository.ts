import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { DeliveryRepository } from '../application/delivery.repository.js';
import type { NewDelivery } from '../application/delivery.repository.js';
import type {
  BookDeliveryInput,
  PhotoInput,
  ProofPurpose,
} from '../contracts/delivery.schemas.js';
import type {
  DeliveryRecord,
  DeliveryPatch,
  ProofPatch,
  DeliveryClaim,
} from '../contracts/delivery-contracts.js';
@Injectable()
export class PrismaDeliveryRepository extends DeliveryRepository {
  async activeContact(c: TransactionContext, userId: string) {
    return !!(await this.client(c).delivery.findFirst({
      where: {
        status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED', 'NO_COURIER'] },
        OR: [{ senderUserId: userId }, { recipientUserId: userId }],
      },
      select: { id: true },
    }));
  }
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
  get(id: string, context?: TransactionContext) {
    return this.client(context).delivery.findUnique({ where: { id } });
  }
  async lock(context: TransactionContext, id: string) {
    await this.client(context)
      .$queryRaw`SELECT id FROM deliveries WHERE id=${id}::uuid FOR UPDATE`;
  }
  activeBookerCount(context: TransactionContext, bookerUserId: string) {
    return this.client(context).delivery.count({
      where: { bookerUserId, completedAt: null },
    });
  }
  async create(
    context: TransactionContext,
    data: NewDelivery,
    input: BookDeliveryInput,
    serviceAreaSnapshot: Record<string, number>,
  ) {
    const row = await this.client(context).delivery.create({
      data: {
        ...data,
        perspective: input.perspective,
        senderName: input.sender.name,
        senderPhone: input.sender.phone,
        recipientName: input.recipient.name,
        recipientPhone: input.recipient.phone,
        packageDescription: input.package.description,
        packageSize: input.package.size,
        packageWeightGrams: input.package.weightGrams,
        packagePhotoId: input.package.photoId,
        contactSharingConsent: input.contactSharingConsent,
        termsAcceptedAt: new Date(),
        serviceAreaSnapshot,
        searchExpiresAt: new Date(Date.now() + 120000),
        task: { create: {} },
      },
    });
    await this.client(context).deliveryEvent.create({
      data: {
        deliveryId: row.id,
        aggregateVersion: 1,
        eventType: 'delivery.booked',
      },
    });
    return row;
  }
  async transition(
    context: TransactionContext,
    id: string,
    data: DeliveryPatch,
    eventType: string,
  ) {
    const row = await this.client(context).delivery.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
    await this.client(context).deliveryEvent.create({
      data: { deliveryId: id, aggregateVersion: row.version, eventType },
    });
    return row;
  }
  request(
    context: TransactionContext,
    actorUserId: string,
    action: string,
    requestKey: string,
  ) {
    return this.client(context).deliveryRequest.findUnique({
      where: {
        actorUserId_action_requestKey: { actorUserId, action, requestKey },
      },
      select: { deliveryId: true, requestFingerprint: true, createdAt: true },
    });
  }
  async remember(
    context: TransactionContext,
    actorUserId: string,
    action: string,
    requestKey: string,
    requestFingerprint: string,
    deliveryId: string,
    reason?: string,
  ) {
    await this.client(context).deliveryRequest.create({
      data: {
        actorUserId,
        action,
        requestKey,
        requestFingerprint,
        deliveryId,
        requestReason: reason ?? null,
      },
    });
  }
  photo(id: string, context?: TransactionContext) {
    return this.client(context).deliveryPackagePhoto.findUnique({
      where: { id },
    });
  }
  async lockPhoto(context: TransactionContext, id: string) {
    await this.client(context)
      .$queryRaw`SELECT id FROM delivery_package_photos WHERE id=${id}::uuid FOR UPDATE`;
  }
  recentPhotoCount(context: TransactionContext, ownerUserId: string) {
    return this.client(context).deliveryPackagePhoto.count({
      where: {
        ownerUserId,
        createdAt: { gte: new Date(Date.now() - 86400000) },
      },
    });
  }
  createPhoto(
    context: TransactionContext,
    ownerUserId: string,
    input: PhotoInput,
  ) {
    return this.client(context).deliveryPackagePhoto.create({
      data: {
        ownerUserId,
        ...input,
        objectKey: randomUUID(),
        uploadExpiresAt: new Date(Date.now() + 600000),
      },
    });
  }
  async photoUsed(packagePhotoId: string, context: TransactionContext) {
    return !!(await this.client(context).delivery.findUnique({
      where: { packagePhotoId },
      select: { id: true },
    }));
  }
  async storePhoto(context: TransactionContext, id: string) {
    await this.client(context).deliveryPackagePhoto.update({
      where: { id },
      data: { status: 'STORED' },
    });
  }
  deliveryByPhoto(packagePhotoId: string) {
    return this.database.client.delivery.findUnique({
      where: { packagePhotoId },
    });
  }
  offer(id: string, context?: TransactionContext) {
    return this.client(context).deliveryOffer.findUnique({ where: { id } });
  }
  offers(context: TransactionContext, deliveryId: string) {
    return this.client(context).deliveryOffer.findMany({
      where: { deliveryId },
      take: 30,
    });
  }
  async createOffers(
    context: TransactionContext,
    d: DeliveryRecord,
    courierIds: string[],
    wave: number,
    radiusMeters: number,
  ) {
    const now = new Date();
    await this.client(context).deliveryOffer.updateMany({
      where: { deliveryId: d.id, status: 'OFFERED', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    await this.client(context).deliveryOffer.createMany({
      data: courierIds.map((courierUserId) => ({
        deliveryId: d.id,
        courierUserId,
        wave,
        radiusMeters,
        expiresAt: new Date(
          Math.min(now.getTime() + 30000, d.searchExpiresAt.getTime()),
        ),
      })),
      skipDuplicates: true,
    });
  }
  async respondOffer(
    context: TransactionContext,
    id: string,
    status: 'ACCEPTED' | 'DECLINED',
  ) {
    await this.client(context).deliveryOffer.update({
      where: { id },
      data: { status },
    });
  }
  async withdrawOffers(
    context: TransactionContext,
    deliveryId: string,
    acceptedId?: string,
  ) {
    await this.client(context).deliveryOffer.updateMany({
      where: {
        deliveryId,
        status: 'OFFERED',
        ...(acceptedId ? { id: { not: acceptedId } } : {}),
      },
      data: { status: 'WITHDRAWN' },
    });
  }
  courierOffers(courierUserId: string) {
    return this.database.client.deliveryOffer.findMany({
      where: {
        courierUserId,
        status: 'OFFERED',
        expiresAt: { gt: new Date() },
        delivery: { status: 'SEARCHING' },
      },
      include: { delivery: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }
  private participant(userId: string) {
    return {
      OR: [
        { bookerUserId: userId },
        { senderUserId: userId },
        { recipientUserId: userId },
        { courierUserId: userId },
      ],
    };
  }
  async list(userId: string, limit: number, cursor?: string) {
    const scope = this.participant(userId);
    const boundary = cursor
      ? await this.database.client.delivery.findFirst({
          where: { id: cursor, ...scope },
          select: { id: true, createdAt: true },
        })
      : null;
    if (cursor && !boundary)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Restart pagination with a current cursor',
      );
    return this.database.client.delivery.findMany({
      where: {
        ...scope,
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
    return this.database.client.delivery.findMany({
      where: { ...this.participant(userId), completedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
  events(deliveryId: string, afterVersion: number) {
    return this.database.client.deliveryEvent.findMany({
      where: { deliveryId, aggregateVersion: { gt: afterVersion } },
      orderBy: { aggregateVersion: 'asc' },
      take: 50,
    });
  }
  proof(
    context: TransactionContext,
    deliveryId: string,
    purpose: ProofPurpose,
  ) {
    return this.client(context).deliveryProof.findUnique({
      where: { deliveryId_purpose: { deliveryId, purpose } },
    });
  }
  async updateProof(
    context: TransactionContext,
    deliveryId: string,
    purpose: ProofPurpose,
    data: ProofPatch,
  ) {
    await this.client(context).deliveryProof.upsert({
      where: { deliveryId_purpose: { deliveryId, purpose } },
      create: { deliveryId, purpose, ...data },
      update: data,
    });
  }
  async invalidateProof(
    context: TransactionContext,
    deliveryId: string,
    purpose: ProofPurpose,
    codeHash: string,
  ) {
    await this.client(context).deliveryProof.updateMany({
      where: { deliveryId, purpose, codeHash },
      data: { codeHash: null, expiresAt: null },
    });
  }
  issue(id: string, context?: TransactionContext) {
    return this.client(context).deliveryIssue.findUnique({ where: { id } });
  }
  issues(deliveryId: string, context?: TransactionContext) {
    return this.client(context).deliveryIssue.findMany({
      where: { deliveryId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
    });
  }
  createIssue(
    context: TransactionContext,
    deliveryId: string,
    openedById: string,
    kind: string,
    reason: string,
  ) {
    return this.client(context).deliveryIssue.create({
      data: { deliveryId, openedById, kind, reason },
    });
  }
  async resolveIssue(
    context: TransactionContext,
    id: string,
    resolvedById: string,
    resolution: string,
    resolutionReason: string,
  ) {
    await this.client(context).deliveryIssue.update({
      where: { id },
      data: {
        resolvedById,
        resolution,
        resolutionReason,
        resolvedAt: new Date(),
      },
    });
  }
  async rate(
    context: TransactionContext,
    d: DeliveryRecord,
    stars: number,
    comment?: string,
  ) {
    const old = await this.client(context).deliveryRating.findUnique({
      where: { deliveryId: d.id },
    });
    if (old) {
      if (old.stars !== stars || old.comment !== (comment ?? null))
        throw new BusinessError(
          'IDEMPOTENCY_CONFLICT',
          'Delivery already has a different rating',
        );
      return;
    }
    if (!d.courierUserId) throw new Error('Delivered package has no courier');
    await this.client(context).deliveryRating.create({
      data: {
        deliveryId: d.id,
        bookerUserId: d.bookerUserId,
        courierUserId: d.courierUserId,
        stars,
        comment: comment ?? null,
      },
    });
  }
  rating(deliveryId: string) {
    return this.database.client.deliveryRating.findUnique({
      where: { deliveryId },
      select: { stars: true, comment: true, createdAt: true },
    });
  }
  capabilities(deliveryId: string, context?: TransactionContext) {
    return this.client(context).deliveryTrackingCapability.findMany({
      where: { deliveryId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
  capability(id: string, context?: TransactionContext) {
    return this.client(context).deliveryTrackingCapability.findUnique({
      where: { id },
    });
  }
  async createCapability(
    context: TransactionContext,
    deliveryId: string,
    data: {
      id: string;
      issuedById: string;
      tokenHash: string;
      requestedTtlSeconds: number;
      expiresAt: Date;
    },
  ) {
    await this.client(context).deliveryTrackingCapability.create({
      data: { ...data, deliveryId },
    });
  }
  async revokeCapability(
    context: TransactionContext,
    id: string,
    deliveryId: string,
  ) {
    await this.client(context).deliveryTrackingCapability.updateMany({
      where: { id, deliveryId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  taskInfo(deliveryId: string) {
    return this.database.client.deliveryDispatchTask.findUnique({
      where: { deliveryId },
      select: { reviewRequired: true, availableAt: true, completedAt: true },
    });
  }
  async dueTasks(limit: number) {
    const now = new Date();
    return (
      await this.database.client.deliveryDispatchTask.findMany({
        where: {
          completedAt: null,
          reviewRequired: false,
          availableAt: { lte: now },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        orderBy: { availableAt: 'asc' },
        take: limit,
        select: { deliveryId: true },
      })
    ).map((row) => row.deliveryId);
  }
  async claimTask(deliveryId: string) {
    const leaseToken = randomUUID(),
      now = new Date();
    const claimed = await this.database.client.deliveryDispatchTask.updateMany({
      where: {
        deliveryId,
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
    const row =
      await this.database.client.deliveryDispatchTask.findUniqueOrThrow({
        where: { deliveryId },
      });
    return { deliveryId, leaseToken, attempts: row.attempts };
  }
  async ownsTask(context: TransactionContext, claim: DeliveryClaim) {
    const rows = await this.client(context).$queryRaw<
      { lease_token: string | null; lease_expires_at: Date | null }[]
    >`SELECT lease_token,lease_expires_at FROM delivery_dispatch_tasks WHERE delivery_id=${claim.deliveryId}::uuid FOR UPDATE`;
    return (
      rows[0]?.lease_token === claim.leaseToken &&
      !!rows[0].lease_expires_at &&
      rows[0].lease_expires_at > new Date()
    );
  }
  async scheduleTask(
    context: TransactionContext,
    claim: DeliveryClaim,
    availableAt: Date | null,
    reviewRequired = false,
    failed = false,
  ) {
    await this.client(context).deliveryDispatchTask.updateMany({
      where: { deliveryId: claim.deliveryId, leaseToken: claim.leaseToken },
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
  async stopTask(context: TransactionContext, deliveryId: string) {
    await this.client(context).deliveryDispatchTask.updateMany({
      where: { deliveryId },
      data: { completedAt: new Date(), leaseToken: null, leaseExpiresAt: null },
    });
  }
  async retryTask(context: TransactionContext, deliveryId: string) {
    await this.client(context).deliveryDispatchTask.update({
      where: { deliveryId },
      data: {
        completedAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        attempts: 0,
        reviewRequired: false,
        availableAt: new Date(),
      },
    });
  }
}
