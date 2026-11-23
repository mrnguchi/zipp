import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { OperationsRepository } from '../application/operations.repository.js';
import type { CaseRecord, CaseEvent } from '../contracts/operations-records.js';
import type {
  CaseQuery,
  Receipt,
  SubjectType,
  CaseStatus,
  ReasonCode,
} from '../contracts/operations.schemas.js';
@Injectable()
export class PrismaOperationsRepository extends OperationsRepository {
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
      where: { key: 'operations', value: 'm7_5' },
    });
  }
  private record(
    r: { subjectType: string; status: string; reasonCode: string } & Omit<
      CaseRecord,
      'subjectType' | 'status' | 'reasonCode'
    >,
  ): CaseRecord {
    return {
      ...r,
      subjectType: r.subjectType as SubjectType,
      status: r.status as CaseStatus,
      reasonCode: r.reasonCode as ReasonCode,
    };
  }
  async get(c: TransactionContext, id: string, lock = false) {
    if (lock)
      await this.client(c)
        .$queryRaw`SELECT id FROM operations_cases WHERE id=${id}::uuid FOR UPDATE`;
    const r = await this.client(c).operationsCase.findUnique({ where: { id } });
    return r ? this.record(r) : null;
  }
  async list(
    c: TransactionContext,
    types: readonly SubjectType[],
    q: CaseQuery,
  ) {
    return (
      await this.client(c).operationsCase.findMany({
        where: {
          subjectType: {
            in: q.subjectType
              ? types.filter((t) => t === q.subjectType)
              : [...types],
          },
          ...(q.status ? { status: q.status } : {}),
          ...(q.afterId ? { id: { gt: q.afterId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: q.limit,
      })
    ).map((r) => this.record(r));
  }
  async create(c: TransactionContext, r: CaseRecord) {
    await this.client(c).operationsCase.create({ data: r });
  }
  async save(c: TransactionContext, r: CaseRecord) {
    await this.client(c).operationsCase.update({
      where: { id: r.id },
      data: { status: r.status, version: r.version, updatedAt: r.updatedAt },
    });
  }
  async event(c: TransactionContext, r: CaseEvent) {
    await this.client(c).operationsCaseEvent.create({ data: r });
  }
  async events(
    c: TransactionContext,
    caseId: string,
    after: number,
    limit: number,
  ): Promise<CaseEvent[]> {
    return (
      await this.client(c).operationsCaseEvent.findMany({
        where: { caseId, version: { gt: after } },
        orderBy: { version: 'asc' },
        take: limit,
      })
    ).map((r) => ({
      ...r,
      action: r.action as CaseEvent['action'],
      status: r.status as CaseStatus,
      reasonCode: r.reasonCode as ReasonCode,
      accountStatus: r.accountStatus as CaseEvent['accountStatus'],
    }));
  }
  async command(
    c: TransactionContext,
    actorUserId: string,
    operation: string,
    key: string,
  ) {
    const r = await this.client(c).operationsCommand.findUnique({
      where: { actorUserId_operation_key: { actorUserId, operation, key } },
    });
    return r
      ? {
          caseId: r.caseId,
          version: r.version,
          status: r.status as CaseStatus,
          accountStatus: r.accountStatus as Receipt['accountStatus'],
          fingerprint: r.fingerprint,
        }
      : null;
  }
  async receipt(
    c: TransactionContext,
    actorUserId: string,
    operation: string,
    key: string,
    fingerprint: string,
    r: Receipt,
  ) {
    await this.client(c).operationsCommand.create({
      data: { actorUserId, operation, key, fingerprint, ...r },
    });
  }
}
