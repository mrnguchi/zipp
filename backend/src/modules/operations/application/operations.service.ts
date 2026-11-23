import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import { DeliveriesFacade } from '../../deliveries/deliveries.facade.js';
import { OperationsConfig } from '../operations.config.js';
import { OperationsRepository } from './operations.repository.js';
import { OperationsSubjectsService } from './operations-subjects.service.js';
import {
  operationsRoles,
  assertCaseTransition,
  assertCaseVersion,
} from '../domain/operations-rules.js';
import { caseProjection } from '../contracts/operations-records.js';
import type { CaseRecord, CaseEvent } from '../contracts/operations-records.js';
import type {
  OpenCase,
  ReviewCase,
  AccountCase,
  CaseQuery,
  Receipt,
  SubjectType,
  ReasonCode,
} from '../contracts/operations.schemas.js';
@Injectable()
export class OperationsService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(DeliveriesFacade) private readonly deliveries: DeliveriesFacade,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
    @Inject(OperationsConfig) private readonly config: OperationsConfig,
    @Inject(OperationsRepository) private readonly repo: OperationsRepository,
    @Inject(OperationsSubjectsService)
    private readonly subjects: OperationsSubjectsService,
  ) {}
  private async admit(a: Actor, write = false) {
    this.config.assertEnabled();
    await this.limiter.consume([
      {
        key: `operations:${write ? 'write' : 'read'}:${this.identity.pseudonym('actor', a.userId)}`,
        limit: write ? 20 : 60,
        windowMs: 60000,
      },
    ]);
  }
  private fingerprint(input: unknown) {
    return this.identity.pseudonym(
      'operations-command-v1',
      JSON.stringify(input),
    );
  }
  private async replay(
    c: TransactionContext,
    a: Actor,
    op: string,
    key: string,
    fingerprint: string,
  ): Promise<Receipt | null> {
    const r = await this.repo.command(c, a.userId, op, key);
    if (!r) return null;
    if (r.fingerprint !== fingerprint)
      throw new BusinessError(
        'IDEMPOTENCY_CONFLICT',
        'Request key has different input',
      );
    return {
      caseId: r.caseId,
      version: r.version,
      status: r.status,
      accountStatus: r.accountStatus,
    };
  }
  private async append(
    c: TransactionContext,
    a: Actor,
    r: CaseRecord,
    action: CaseEvent['action'],
    reasonCode: ReasonCode,
    accountStatus: Receipt['accountStatus'],
  ) {
    await this.repo.event(c, {
      id: randomUUID(),
      caseId: r.id,
      version: r.version,
      action,
      status: r.status,
      reasonCode,
      actorUserId: a.userId,
      accountStatus,
      createdAt: r.updatedAt,
    });
    await this.audit.record(
      c,
      a.userId,
      `operations.${action.toLowerCase()}`,
      r.id,
    );
  }
  private async remember(
    c: TransactionContext,
    a: Actor,
    op: string,
    key: string,
    fingerprint: string,
    r: CaseRecord,
    accountStatus: Receipt['accountStatus'] = null,
  ) {
    const receipt: Receipt = {
      caseId: r.id,
      version: r.version,
      status: r.status,
      accountStatus,
    };
    await this.repo.receipt(c, a.userId, op, key, fingerprint, receipt);
    return receipt;
  }
  async open(a: Actor, key: string, input: OpenCase) {
    await this.admit(a, true);
    const normalized = { ...input, subjectId: input.subjectId.toLowerCase() };
    const fingerprint = this.fingerprint([
      normalized.subjectType,
      normalized.subjectId,
      normalized.reasonCode,
      normalized.description,
    ]);
    return this.tx.run(async (c) => {
      await this.subjects.summary(
        c,
        a,
        normalized.subjectType,
        normalized.subjectId,
      );
      const previous = await this.replay(c, a, 'OPEN', key, fingerprint);
      if (previous) return previous;
      const now = new Date();
      const r: CaseRecord = {
        id: randomUUID(),
        ...normalized,
        status: 'OPEN',
        version: 1,
        openedByUserId: a.userId,
        createdAt: now,
        updatedAt: now,
      };
      await this.repo.create(c, r);
      await this.append(c, a, r, 'OPEN', r.reasonCode, null);
      return this.remember(c, a, 'OPEN', key, fingerprint, r);
    });
  }
  private async authorized(
    c: TransactionContext,
    a: Actor,
    id: string,
    admin = false,
    lock = false,
  ) {
    const first = await this.repo.get(c, id);
    if (!first) throw new BusinessError('NOT_FOUND', 'Case not found');
    await this.identity.authorize(
      c,
      a,
      admin ? ['ADMIN'] : operationsRoles(first.subjectType),
      true,
      admin ? [first.subjectId] : [],
    );
    const r = await this.repo.get(c, id, lock);
    if (!r) throw new BusinessError('NOT_FOUND', 'Case not found');
    return r;
  }
  async review(a: Actor, key: string, id: string, input: ReviewCase) {
    await this.admit(a, true);
    const fingerprint = this.fingerprint([
      id.toLowerCase(),
      input.expectedVersion,
      input.status,
      input.reasonCode,
    ]);
    return this.tx.run(async (c) => {
      const r = await this.authorized(c, a, id, false, true);
      const previous = await this.replay(c, a, 'REVIEW', key, fingerprint);
      if (previous) return previous;
      assertCaseVersion(r.version, input.expectedVersion);
      assertCaseTransition(r.status, input.status);
      r.status = input.status;
      r.version++;
      r.updatedAt = new Date();
      await this.repo.save(c, r);
      await this.append(c, a, r, 'REVIEW', input.reasonCode, null);
      return this.remember(c, a, 'REVIEW', key, fingerprint, r);
    });
  }
  async accountStatus(a: Actor, key: string, id: string, input: AccountCase) {
    await this.admit(a, true);
    const fingerprint = this.fingerprint([
      id.toLowerCase(),
      input.expectedVersion,
      input.expectedAccountStatus,
      input.accountStatus,
      input.reasonCode,
    ]);
    return this.tx.run(async (c) => {
      const r = await this.authorized(c, a, id, true, true);
      if (r.subjectType !== 'ACCOUNT')
        throw new BusinessError(
          'INVALID_TRANSITION',
          'An account case is required',
        );
      const previous = await this.replay(
        c,
        a,
        'ACCOUNT_STATUS',
        key,
        fingerprint,
      );
      if (previous) return previous;
      assertCaseVersion(r.version, input.expectedVersion);
      if (r.status !== 'IN_REVIEW')
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Start reviewing the case first',
        );
      if (input.accountStatus === 'SUSPENDED') {
        await this.deliveries.assertOperationsCanSuspend(c, r.subjectId);
        await this.finance.assertOperationsCanSuspend(c, r.subjectId);
      }
      const status = await this.identity.operationsStatus(
        c,
        a,
        r.subjectId,
        input.expectedAccountStatus,
        input.accountStatus,
      );
      r.version++;
      r.updatedAt = new Date();
      await this.repo.save(c, r);
      await this.append(c, a, r, 'ACCOUNT_STATUS', input.reasonCode, status);
      return this.remember(c, a, 'ACCOUNT_STATUS', key, fingerprint, r, status);
    });
  }
  async get(a: Actor, id: string) {
    await this.admit(a);
    return this.tx.run(async (c) => {
      const r = await this.authorized(c, a, id);
      await this.audit.record(c, a.userId, 'operations.case_read', id);
      return caseProjection(r);
    });
  }
  async list(a: Actor, q: CaseQuery) {
    await this.admit(a);
    return this.tx.run(async (c) => {
      const current = await this.identity.authorize(
        c,
        a,
        ['ADMIN', 'SUPPORT', 'FINANCE'],
        true,
      );
      const types: SubjectType[] = current.roles.includes('ADMIN')
        ? ['ACCOUNT', 'DRIVER', 'RIDE', 'DELIVERY', 'PAYMENT']
        : [
            ...(current.roles.includes('SUPPORT')
              ? (['ACCOUNT', 'DRIVER', 'RIDE', 'DELIVERY'] as const)
              : []),
            ...(current.roles.includes('FINANCE')
              ? (['PAYMENT'] as const)
              : []),
          ];
      if (q.subjectType && !types.includes(q.subjectType))
        throw new BusinessError('FORBIDDEN', 'Case category is restricted');
      const rows = await this.repo.list(c, types, q);
      await this.audit.record(c, a.userId, 'operations.case_queue_read');
      return {
        items: rows.map(caseProjection),
        nextAfterId: rows.length === q.limit ? (rows.at(-1)?.id ?? null) : null,
      };
    });
  }
  async events(a: Actor, id: string, after: number, limit: number) {
    await this.admit(a);
    return this.tx.run(async (c) => {
      await this.authorized(c, a, id);
      const rows = await this.repo.events(c, id, after, limit);
      await this.audit.record(c, a.userId, 'operations.case_history_read', id);
      return {
        items: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        nextAfterVersion: rows.at(-1)?.version ?? after,
      };
    });
  }
  async subject(a: Actor, type: SubjectType, id: string, reason: ReasonCode) {
    await this.admit(a);
    return this.tx.run(async (c) => {
      const result = await this.subjects.summary(c, a, type, id);
      await this.audit.record(
        c,
        a.userId,
        `operations.subject_read.${reason.toLowerCase()}`,
        id,
      );
      return result;
    });
  }
  async capabilities(a: Actor) {
    await this.admit(a);
    return this.tx.run(async (c) => {
      const actor = await this.identity.authorize(
        c,
        a,
        ['ADMIN', 'SUPPORT', 'FINANCE'],
        true,
      );
      return {
        caseTypes: (
          ['ACCOUNT', 'DRIVER', 'RIDE', 'DELIVERY', 'PAYMENT'] as const
        ).filter((t) =>
          operationsRoles(t).some((r) => actor.roles.includes(r)),
        ),
        accountStatusChanges: actor.roles.includes('ADMIN'),
        financeReports: actor.roles.some(
          (r) => r === 'ADMIN' || r === 'FINANCE',
        ),
        automaticFraudDecisions: false as const,
        arbitraryFinancialAdjustments: false as const,
      };
    });
  }
  async report(a: Actor, limit: number, afterId?: string) {
    await this.admit(a);
    return this.tx.run(async (c) => {
      const result = await this.finance.operationsReport(c, a, limit, afterId);
      await this.audit.record(c, a.userId, 'operations.finance_report_read');
      return result;
    });
  }
}
