import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { DriverRepository } from '../application/driver.repository.js';
import type {
  DriverRecord,
  DriverStatus,
  DriverClass,
} from '../contracts/driver-contracts.js';
import type {
  VehicleInput,
  DocumentInput,
  LocationInput,
  ReviewInput,
} from '../contracts/driver.schemas.js';
import { BusinessError } from '../../../shared/errors/business-error.js';

const include = { vehicle: true, presence: true } as const;
@Injectable()
export class PrismaDriverRepository extends DriverRepository {
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
  async candidates(
    pickup: { latitude: number; longitude: number },
    radiusMeters: number,
    serviceClass: DriverClass,
    excludeUserId: string,
  ) {
    const now = new Date(),
      fresh = new Date(now.getTime() - 15000),
      future = new Date(now.getTime() + 5000);
    const latDelta = radiusMeters / 111000,
      lonDelta =
        radiusMeters /
        (111000 * Math.max(0.01, Math.cos((pickup.latitude * Math.PI) / 180)));
    const rows = await this.database.client.$queryRaw<
      { owner_user_id: string; distance_meters: number }[]
    >`
      SELECT a.owner_user_id,6371000*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(p.latitude-${pickup.latitude})/2),2)+cos(radians(${pickup.latitude}))*cos(radians(p.latitude))*power(sin(radians(p.longitude-${pickup.longitude})/2),2))))) AS distance_meters
      FROM driver_applications a JOIN driver_presence p ON p.driver_application_id=a.id
      JOIN users u ON u.id=a.owner_user_id JOIN auth_sessions s ON s.id=p.auth_session_id AND s.user_id=u.id
      WHERE a.status='APPROVED' AND u.status='ACTIVE' AND 'DRIVER'::"UserRole"=ANY(u.roles)
        AND ${serviceClass}::"ServiceClass"=ANY(a.approved_classes) AND a.owner_user_id<>${excludeUserId}::uuid
        AND p.online AND p.session_expires_at>${now} AND p.received_at>=${fresh} AND p.received_at<=${now}
        AND p.captured_at>=${fresh} AND p.captured_at<=${future} AND p.accuracy_meters BETWEEN 0 AND 100
        AND s.revoked_at IS NULL AND s.expires_at>${now}
        AND p.latitude BETWEEN ${pickup.latitude - latDelta} AND ${pickup.latitude + latDelta}
        AND p.longitude BETWEEN ${pickup.longitude - lonDelta} AND ${pickup.longitude + lonDelta}
        AND EXISTS(SELECT 1 FROM driver_vehicles v WHERE v.driver_application_id=a.id)
        AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['IDENTITY','LICENSE','VEHICLE_REGISTRATION','INSURANCE']::"DriverDocumentKind"[]) k(kind)
          WHERE NOT EXISTS(SELECT 1 FROM driver_documents d WHERE d.driver_application_id=a.id AND d.application_revision=a.revision AND d.kind=k.kind AND d.status='APPROVED' AND d.document_expires_at>${now}))
      ORDER BY distance_meters,a.owner_user_id LIMIT 50`;
    return rows
      .filter((row) => row.distance_meters <= radiusMeters)
      .map((row) => ({
        ownerUserId: row.owner_user_id,
        distanceMeters: row.distance_meters,
      }));
  }
  reviews(driverApplicationId: string) {
    return this.database.client.driverReview.findMany({
      where: { driverApplicationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        applicationRevision: true,
        decision: true,
        reason: true,
        createdAt: true,
      },
    });
  }
  findOwner(ownerUserId: string, context?: TransactionContext) {
    return this.client(context).driverApplication.findUnique({
      where: { ownerUserId },
      include,
    });
  }
  find(id: string, context?: TransactionContext) {
    return this.client(context).driverApplication.findUnique({
      where: { id },
      include,
    });
  }
  ensure(context: TransactionContext, ownerUserId: string) {
    return this.client(context).driverApplication.upsert({
      where: { ownerUserId },
      create: { ownerUserId },
      update: {},
      include,
    });
  }
  async lock(context: TransactionContext, id: string) {
    await this.client(context)
      .$queryRaw`SELECT id FROM driver_applications WHERE id=${id}::uuid FOR UPDATE`;
  }
  async change(
    context: TransactionContext,
    id: string,
    data: {
      status?: DriverStatus;
      revision?: number;
      approvedClasses?: DriverClass[];
      submittedAt?: Date | null;
      reviewedAt?: Date | null;
    },
  ) {
    await this.client(context).driverApplication.update({
      where: { id },
      data,
    });
  }
  async saveVehicle(
    context: TransactionContext,
    id: string,
    input: VehicleInput,
  ) {
    await this.client(context).driverVehicle.upsert({
      where: { driverApplicationId: id },
      create: { driverApplicationId: id, ...input },
      update: input,
    });
  }
  documents(
    driverApplicationId: string,
    applicationRevision: number,
    context?: TransactionContext,
  ) {
    return this.client(context).driverDocument.findMany({
      where: { driverApplicationId, applicationRevision },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  }
  document(id: string, context?: TransactionContext) {
    return this.client(context).driverDocument.findUnique({ where: { id } });
  }
  createDocument(
    context: TransactionContext,
    driver: DriverRecord,
    input: DocumentInput,
  ) {
    return this.client(context).driverDocument.create({
      data: {
        driverApplicationId: driver.id,
        applicationRevision: driver.revision,
        ...input,
        documentExpiresAt: new Date(input.documentExpiresAt),
        objectKey: randomUUID(),
        uploadExpiresAt: new Date(Date.now() + 600_000),
      },
    });
  }
  async storeDocument(context: TransactionContext, id: string) {
    await this.client(context).driverDocument.update({
      where: { id },
      data: { status: 'STORED' },
    });
  }
  async review(
    context: TransactionContext,
    driver: DriverRecord,
    reviewerId: string,
    input: ReviewInput,
    documentIds: string[],
  ) {
    await this.client(context).driverReview.create({
      data: {
        driverApplicationId: driver.id,
        applicationRevision: driver.revision,
        reviewerUserId: reviewerId,
        decision: input.decision,
        reason: input.reason,
        documentIds,
      },
    });
  }
  async markDocuments(
    context: TransactionContext,
    ids: string[],
    approved: boolean,
  ) {
    await this.client(context).driverDocument.updateMany({
      where: { id: { in: ids } },
      data: { status: approved ? 'APPROVED' : 'REJECTED' },
    });
  }
  async setPresence(
    context: TransactionContext,
    driverApplicationId: string,
    authSessionId: string,
    online: boolean,
  ) {
    const client = this.client(context);
    const old = await client.driverPresence.findUnique({
      where: { driverApplicationId },
    });
    if (
      online &&
      old?.online &&
      old.authSessionId === authSessionId &&
      old.sessionExpiresAt > new Date()
    )
      return old;
    const data = {
      authSessionId,
      online,
      locationSessionId: randomUUID(),
      sessionExpiresAt: new Date(Date.now() + 12 * 3600_000),
      sequence: 0,
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      capturedAt: null,
      receivedAt: null,
    };
    return client.driverPresence.upsert({
      where: { driverApplicationId },
      create: { driverApplicationId, ...data },
      update: data,
    });
  }
  acceptLocation(
    context: TransactionContext,
    driverApplicationId: string,
    input: LocationInput,
  ) {
    return this.client(context).driverPresence.update({
      where: { driverApplicationId },
      data: {
        sequence: input.sequence,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters,
        capturedAt: new Date(input.capturedAt),
        receivedAt: new Date(),
      },
    });
  }
  async list(limit: number, cursor?: string) {
    const boundary = cursor
      ? await this.database.client.driverApplication.findUnique({
          where: { id: cursor },
          select: { createdAt: true, id: true },
        })
      : null;
    if (cursor && !boundary)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Restart pagination with a current cursor',
      );
    return this.database.client.driverApplication.findMany({
      where: boundary
        ? {
            OR: [
              { createdAt: { lt: boundary.createdAt } },
              { createdAt: boundary.createdAt, id: { lt: boundary.id } },
            ],
          }
        : {},
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
}
