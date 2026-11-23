import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { CommunicationsRepository } from '../application/communications.repository.js';
import type {
  ThreadRecord,
  MessageRecord,
  CommandReceipt,
} from '../contracts/communication-records.js';
import type {
  JobContext,
  TicketQuery,
} from '../contracts/communication.schemas.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class PrismaCommunicationsRepository extends CommunicationsRepository {
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
      where: { key: 'communications', value: 'm7_2' },
    });
  }
  thread(c: TransactionContext, id: string) {
    return this.client(c).communicationThread.findUnique({ where: { id } });
  }
  jobThread(c: TransactionContext, job: JobContext) {
    return this.client(c).communicationThread.findFirst({
      where: { kind: 'JOB', ...job },
    });
  }
  async lock(c: TransactionContext, id: string) {
    await this.client(c)
      .$queryRaw`SELECT id FROM communication_threads WHERE id=${id}::uuid FOR UPDATE`;
    const row = await this.thread(c, id);
    if (!row) throw new BusinessError('NOT_FOUND', 'Conversation not found');
    return row;
  }
  async create(c: TransactionContext, thread: ThreadRecord) {
    await this.client(c).communicationThread.create({ data: thread });
  }
  openTicketCount(c: TransactionContext, owner: string) {
    return this.client(c).communicationThread.count({
      where: { kind: 'SUPPORT', status: 'OPEN', creatorUserId: owner },
    });
  }
  tickets(c: TransactionContext, owner: string | null, query: TicketQuery) {
    return this.client(c).communicationThread.findMany({
      where: {
        kind: 'SUPPORT',
        ...(owner ? { creatorUserId: owner } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
  }
  command(
    c: TransactionContext,
    actorUserId: string,
    operation: string,
    key: string,
  ) {
    return this.client(c).communicationCommand.findUnique({
      where: { actorUserId_operation_key: { actorUserId, operation, key } },
    });
  }
  async receipt(
    c: TransactionContext,
    actorUserId: string,
    operation: string,
    key: string,
    fingerprint: string,
    receipt: CommandReceipt,
  ) {
    await this.client(c).communicationCommand.create({
      data: { actorUserId, operation, key, fingerprint, ...receipt },
    });
  }
  async append(
    c: TransactionContext,
    thread: ThreadRecord,
    message: MessageRecord,
  ) {
    await this.client(c).communicationMessage.create({ data: message });
    await this.client(c).communicationThread.update({
      where: { id: thread.id },
      data: {
        lastSequence: message.sequence,
        version: thread.version,
        updatedAt: message.createdAt,
      },
    });
  }
  messages(
    c: TransactionContext,
    threadId: string,
    after: number,
    limit: number,
  ) {
    return this.client(c).communicationMessage.findMany({
      where: { threadId, sequence: { gt: after } },
      orderBy: { sequence: 'asc' },
      take: limit + 1,
    });
  }
  async readCursor(c: TransactionContext, threadId: string, userId: string) {
    return (
      (
        await this.client(c).communicationReadCursor.findUnique({
          where: { threadId_userId: { threadId, userId } },
        })
      )?.sequence ?? 0
    );
  }
  async acknowledge(
    c: TransactionContext,
    threadId: string,
    userId: string,
    sequence: number,
  ) {
    await this.client(c).communicationReadCursor.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: { threadId, userId, sequence },
      update: { sequence, updatedAt: new Date() },
    });
  }
  async status(
    c: TransactionContext,
    id: string,
    status: 'OPEN' | 'RESOLVED',
    version: number,
  ) {
    await this.client(c).communicationThread.update({
      where: { id },
      data: { status, version, updatedAt: new Date() },
    });
  }
  async event(
    c: TransactionContext,
    threadId: string,
    aggregateVersion: number,
    eventType: string,
    actorUserId: string,
    messageSequence?: number,
    reason?: string,
  ) {
    const id = randomUUID();
    await this.client(c).communicationEvent.create({
      data: {
        id,
        threadId,
        aggregateVersion,
        eventType,
        actorUserId,
        messageSequence: messageSequence ?? null,
        reason: reason ?? null,
      },
    });
    return id;
  }
}
