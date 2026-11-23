import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CallRepository } from '../application/call.repository.js';
import type { CallRecord, CallOperation } from '../contracts/call-records.js';
import type { CallReceipt } from '../contracts/call.schemas.js';
@Injectable()
export class PrismaCallRepository extends CallRepository {
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
    for (const [key, value] of [
      ['calling', 'm7_4'],
      ['notifications', 'm7_3'],
      ['communications', 'm7_2'],
    ])
      await this.db.client.platformMetadata.findUniqueOrThrow({
        where: { key, value },
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
  async get(c: TransactionContext, id: string, lock = false) {
    if (lock)
      await this.client(c)
        .$queryRaw`SELECT id FROM call_sessions WHERE id=${id}::uuid FOR UPDATE`;
    return this.client(c).callSession.findUnique({ where: { id } });
  }
  async active(c: TransactionContext, userId: string) {
    const slot = await this.client(c).activeCallParticipant.findUnique({
      where: { userId },
    });
    return slot ? this.get(c, slot.callId) : null;
  }
  async create(c: TransactionContext, r: CallRecord) {
    await this.client(c).$queryRaw`SELECT pg_advisory_xact_lock(72111401)`;
    if (
      (await this.client(c).callSession.count({
        where: { status: { in: ['RINGING', 'CONNECTING'] } },
      })) >= 100
    )
      throw new BusinessError('CALL_CAPACITY', 'Call control capacity reached');
    await this.client(c).callSession.create({ data: r });
  }
  async save(c: TransactionContext, r: CallRecord) {
    await this.client(c).callSession.update({
      where: { id: r.id },
      data: {
        calleeSessionId: r.calleeSessionId,
        calleeDeviceId: r.calleeDeviceId,
        calleeDeviceGeneration: r.calleeDeviceGeneration,
        status: r.status,
        version: r.version,
        signalEpoch: r.signalEpoch,
        connectExpiresAt: r.connectExpiresAt,
        acceptedAt: r.acceptedAt,
        endedAt: r.endedAt,
        endReason: r.endReason,
        lastCheckedAt: r.lastCheckedAt,
      },
    });
  }
  async claimAccounts(c: TransactionContext, r: CallRecord) {
    await this.client(c).$queryRaw`SELECT pg_advisory_xact_lock(72111401)`;
    if (
      (await this.client(c).callSession.count({
        where: { status: { in: ['RINGING', 'CONNECTING'] } },
      })) > 100
    )
      throw new BusinessError('CALL_CAPACITY', 'Call control capacity reached');
    if (
      await this.client(c).activeCallParticipant.count({
        where: { userId: { in: [r.callerUserId, r.calleeUserId] } },
      })
    )
      throw new BusinessError(
        'CALL_BUSY',
        'A participant already has an active call',
      );
    await this.client(c).activeCallParticipant.createMany({
      data: [
        { userId: r.callerUserId, callId: r.id, side: 'CALLER' },
        { userId: r.calleeUserId, callId: r.id, side: 'CALLEE' },
      ],
    });
  }
  async releaseAccounts(c: TransactionContext, callId: string) {
    await this.client(c).activeCallParticipant.deleteMany({
      where: { callId },
    });
  }
  async recentPair(c: TransactionContext, a: string, b: string, now: Date) {
    return !!(await this.client(c).callSession.findFirst({
      where: {
        createdAt: { gt: new Date(now.getTime() - 30000) },
        OR: [
          { callerUserId: a, calleeUserId: b },
          { callerUserId: b, calleeUserId: a },
        ],
      },
      select: { id: true },
    }));
  }
  command(
    c: TransactionContext,
    actorUserId: string,
    operation: CallOperation,
    key: string,
  ) {
    return this.client(c).callCommand.findUnique({
      where: { actorUserId_operation_key: { actorUserId, operation, key } },
    });
  }
  async receipt(
    c: TransactionContext,
    actorUserId: string,
    operation: CallOperation,
    key: string,
    fingerprint: string,
    r: CallReceipt,
  ) {
    await this.client(c).callCommand.create({
      data: { actorUserId, operation, key, fingerprint, ...r },
    });
  }
  async event(
    c: TransactionContext,
    r: CallRecord,
    eventType: string,
    actorUserId: string | null,
  ) {
    await this.client(c).callEvent.create({
      data: {
        id: randomUUID(),
        callId: r.id,
        aggregateVersion: r.version,
        eventType,
        actorUserId,
        reason: r.endReason,
      },
    });
  }
  async candidates() {
    return (
      await this.db.client.callSession.findMany({
        where: { status: { in: ['RINGING', 'CONNECTING'] } },
        orderBy: [{ lastCheckedAt: 'asc' }, { id: 'asc' }],
        take: 20,
        select: { id: true },
      })
    ).map((r) => r.id);
  }
  async checked(c: TransactionContext, id: string, lastCheckedAt: Date) {
    await this.client(c).callSession.update({
      where: { id },
      data: { lastCheckedAt },
    });
  }
}
