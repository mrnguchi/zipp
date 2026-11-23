import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  DeviceRecord,
  NotificationIntent,
  DeliveryRecord,
  DeliveryStatus,
} from '../contracts/notification-records.js';
import type { NotificationPage } from '../contracts/notification.schemas.js';
import { NotificationsRepository } from '../application/notifications.repository.js';
@Injectable()
export class PrismaNotificationsRepository extends NotificationsRepository {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(DatabaseUnitOfWork) private readonly tx: DatabaseUnitOfWork,
  ) {
    super();
  }
  private client(c: TransactionContext) {
    return this.tx.client(c);
  }
  async assertSchema() {
    await this.db.client.platformMetadata.findUniqueOrThrow({
      where: { key: 'notifications', value: 'm7_3' },
    });
    await this.db.client.platformMetadata.findUniqueOrThrow({
      where: { key: 'communications', value: 'm7_2' },
    });
  }
  async now(c: TransactionContext) {
    const rows = await this.client(c).$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    const now = rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    return now;
  }
  async device(c: TransactionContext, id: string, lock = false) {
    if (lock)
      await this.client(c)
        .$queryRaw`SELECT id FROM notification_devices WHERE id=${id}::uuid FOR UPDATE`;
    return this.client(c).notificationDevice.findUnique({ where: { id } });
  }
  devices(c: TransactionContext, ownerUserId: string, now: Date) {
    return this.client(c).notificationDevice.findMany({
      where: { ownerUserId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { id: 'asc' },
      take: 5,
    });
  }
  async tokenOwner(c: TransactionContext, tokenHash: string) {
    return (
      (
        await this.client(c).notificationDevice.findUnique({
          where: { tokenHash },
          select: { id: true },
        })
      )?.id ?? null
    );
  }
  async saveDevice(c: TransactionContext, d: DeviceRecord, create: boolean) {
    if (create) await this.client(c).notificationDevice.create({ data: d });
    else
      await this.client(c).notificationDevice.update({
        where: { id: d.id },
        data: {
          sessionId: d.sessionId,
          platform: d.platform,
          tokenHash: d.tokenHash,
          tokenCiphertext: d.tokenCiphertext,
          generation: d.generation,
          expiresAt: d.expiresAt,
          revokedAt: d.revokedAt,
          updatedAt: d.updatedAt,
        },
      });
  }
  async enqueue(
    c: TransactionContext,
    sourceEventId: string,
    recipientUserId: string,
  ) {
    const now = await this.now(c);
    await this.client(c).notificationOutbox.createMany({
      data: [
        {
          id: randomUUID(),
          sourceEventId,
          recipientUserId,
          expiresAt: new Date(now.getTime() + 86400000),
        },
      ],
      skipDuplicates: true,
    });
  }
  async intent(c: TransactionContext, id: string, lock = false) {
    if (lock)
      await this.client(c)
        .$queryRaw`SELECT id FROM notification_outbox WHERE id=${id}::uuid FOR UPDATE`;
    return this.client(c).notificationOutbox.findUnique({ where: { id } });
  }
  async completeIntent(c: TransactionContext, id: string, now: Date) {
    await this.client(c).notificationOutbox.update({
      where: { id },
      data: { completedAt: now },
    });
  }
  async materialize(
    c: TransactionContext,
    intent: NotificationIntent,
    devices: DeviceRecord[],
    now: Date,
  ) {
    await this.client(c).notificationInbox.createMany({
      data: [
        {
          id: intent.id,
          ownerUserId: intent.recipientUserId,
          createdAt: intent.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    await this.client(c).notificationDelivery.createMany({
      data: devices.map((d) => ({
        id: randomUUID(),
        notificationId: intent.id,
        ownerUserId: intent.recipientUserId,
        deviceId: d.id,
        deviceGeneration: d.generation,
        availableAt: now,
      })),
      skipDuplicates: true,
    });
    await this.completeIntent(c, intent.id, now);
  }
  inbox(c: TransactionContext, ownerUserId: string, query: NotificationPage) {
    return this.client(c).notificationInbox.findMany({
      where: {
        ownerUserId,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
  }
  async readInbox(
    c: TransactionContext,
    ownerUserId: string,
    id: string,
    now: Date,
  ) {
    await this.client(c).notificationInbox.updateMany({
      where: { id, ownerUserId, readAt: null },
      data: { readAt: now },
    });
    return this.client(c).notificationInbox.findFirst({
      where: { id, ownerUserId },
    });
  }
  async due() {
    const intents = await this.db.client.notificationOutbox.findMany({
      where: { completedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { id: true },
    });
    const deliveries = await this.db.client.$queryRaw<
      { id: string }[]
    >`SELECT id FROM notification_deliveries WHERE status='PENDING'
      AND available_at<=CURRENT_TIMESTAMP AND (lease_expires_at IS NULL OR lease_expires_at<=CURRENT_TIMESTAMP)
      ORDER BY available_at,id LIMIT 20`;
    return [
      ...intents.map((v) => ({ kind: 'MATERIALIZE' as const, id: v.id })),
      ...deliveries.map((v) => ({ kind: 'DISPATCH' as const, id: v.id })),
    ];
  }
  async delivery(c: TransactionContext, id: string, lock = false) {
    if (lock)
      await this.client(c)
        .$queryRaw`SELECT id FROM notification_deliveries WHERE id=${id}::uuid FOR UPDATE`;
    return this.client(c).notificationDelivery.findUnique({ where: { id } });
  }
  claim(
    c: TransactionContext,
    d: DeliveryRecord,
    leaseToken: string,
    now: Date,
  ) {
    return this.client(c).notificationDelivery.update({
      where: { id: d.id },
      data: {
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + 30000),
        attempts: { increment: 1 },
      },
    });
  }
  async finish(
    c: TransactionContext,
    id: string,
    status: DeliveryStatus,
    now: Date,
    availableAt?: Date,
  ) {
    await this.client(c).notificationDelivery.update({
      where: { id },
      data: {
        status,
        leaseToken: null,
        leaseExpiresAt: null,
        completedAt: status === 'PENDING' ? null : now,
        ...(availableAt ? { availableAt } : {}),
      },
    });
  }
}
