import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { hasRecentMfa } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { FinanceRepository } from '../application/finance.repository.js';
import type { PaymentWork } from '../application/finance.repository.js';
import type {
  OperationType,
  OperationStatus,
  Posting,
  WalletAccountRecord,
} from '../contracts/finance-contracts.js';
import { availableFunds } from '../domain/money.js';

@Injectable()
export class PrismaFinanceRepository extends FinanceRepository {
  operationsPage(context: TransactionContext, limit: number, afterId?: string) {
    return this.client(context).financialOperation.findMany({
      where: afterId ? { id: { gt: afterId } } : {},
      orderBy: { id: 'asc' },
      take: limit,
    });
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
  async authorize(
    context: TransactionContext,
    actor: Actor,
    sensitive: boolean,
    staff = false,
  ) {
    const client = this.client(context);
    await client.$queryRaw`SELECT id FROM users WHERE id = ${actor.userId}::uuid FOR UPDATE`;
    const [user, session] = await Promise.all([
      client.user.findUnique({ where: { id: actor.userId } }),
      client.authSession.findUnique({ where: { id: actor.sessionId } }),
    ]);
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new BusinessError('UNAUTHENTICATED', 'Sign in again');
    if (
      staff &&
      !user.roles.some((role) => role === 'FINANCE' || role === 'ADMIN')
    )
      throw new BusinessError('FORBIDDEN', 'Finance permission required');
    if (
      (sensitive || staff) &&
      !hasRecentMfa({
        ...actor,
        mfaEnabled: !!user.twoFactorSecret,
        mfaVerifiedAt: session.mfaVerifiedAt,
      })
    )
      throw new BusinessError(
        'RECENT_MFA_REQUIRED',
        'Verify two-factor authentication again',
      );
  }
  async wallet(context: TransactionContext, ownerUserId: string) {
    const client = this.client(context);
    // INSERT ON CONFLICT avoids unique-insert aborts during simultaneous lazy provisioning.
    const id = randomUUID();
    await client.$executeRaw`INSERT INTO wallet_accounts (id, owner_user_id, account_type) VALUES (${id}::uuid, ${ownerUserId}::uuid, 'USER') ON CONFLICT (owner_user_id) DO NOTHING`;
    return client.walletAccount.findUniqueOrThrow({ where: { ownerUserId } });
  }
  async lockAccounts(context: TransactionContext, ids: readonly string[]) {
    const ordered = [...new Set(ids)].sort();
    if (!ordered.length) return;
    await this.client(context).$queryRaw(
      Prisma.sql`SELECT id FROM wallet_accounts WHERE id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
    );
  }
  account(context: TransactionContext, id: string) {
    return this.client(context).walletAccount.findUniqueOrThrow({
      where: { id },
    });
  }
  async reserve(
    context: TransactionContext,
    wallet: WalletAccountRecord,
    businessKey: string,
    amountXaf: bigint,
  ) {
    const client = this.client(context);
    const existing = await client.fundReservation.findUnique({
      where: { businessKey },
    });
    if (existing) {
      if (
        existing.walletAccountId !== wallet.id ||
        existing.amountXaf !== amountXaf
      )
        throw new BusinessError(
          'IDEMPOTENCY_CONFLICT',
          'Reservation key has different input',
        );
      return existing;
    }
    availableFunds(wallet.postedAmountXaf, wallet.reservedAmountXaf, amountXaf);
    const row = await client.fundReservation.create({
      data: { walletAccountId: wallet.id, businessKey, amountXaf },
    });
    await this.adjustReserved(context, wallet.id, amountXaf);
    return row;
  }
  reservation(context: TransactionContext, id: string) {
    return this.client(context).fundReservation.findUniqueOrThrow({
      where: { id },
    });
  }
  async updateReservation(
    context: TransactionContext,
    id: string,
    data: {
      status?: 'CAPTURED' | 'RELEASED';
      beneficiaryAccountId?: string;
      platformFeeXaf?: bigint;
      capturedAmountXaf?: bigint;
      refundedAmountXaf?: bigint;
    },
  ) {
    await this.client(context).fundReservation.update({ where: { id }, data });
  }
  async adjustReserved(
    context: TransactionContext,
    accountId: string,
    delta: bigint,
  ) {
    // SQL keeps the app privilege limited to the reservation column; balances are trigger-owned.
    await this.client(context)
      .$executeRaw`UPDATE wallet_accounts SET reserved_amount_xaf = reserved_amount_xaf + ${delta} WHERE id = ${accountId}::uuid`;
  }
  async post(
    context: TransactionContext,
    businessKey: string,
    description: string,
    postings: readonly Posting[],
  ) {
    const entries = postings.filter((row) => row.amountXaf !== 0n);
    if (
      entries.length < 2 ||
      entries.reduce((sum, row) => sum + row.amountXaf, 0n) !== 0n
    )
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Ledger transaction must balance',
      );
    const row = await this.client(context).ledgerTransaction.create({
      data: {
        businessKey,
        description,
        postings: { create: entries.map((row) => ({ ...row })) },
      },
    });
    return row.id;
  }
  async ledgerByKey(context: TransactionContext, businessKey: string) {
    return this.client(context).ledgerTransaction.findUnique({
      where: { businessKey },
      select: {
        id: true,
        postings: { select: { walletAccountId: true, amountXaf: true } },
      },
    });
  }
  request(
    context: TransactionContext,
    actorId: string,
    operationType: string,
    key: string,
  ) {
    return this.client(context).idempotencyRecord.findUnique({
      where: {
        actorUserId_operationType_requestKey: {
          actorUserId: actorId,
          operationType,
          requestKey: key,
        },
      },
    });
  }
  async remember(
    context: TransactionContext,
    actorId: string,
    operationType: string,
    key: string,
    fingerprint: string,
    operationId: string,
    reason?: string,
  ) {
    await this.client(context).idempotencyRecord.create({
      data: {
        actorUserId: actorId,
        operationType,
        requestKey: key,
        requestFingerprint: fingerprint,
        operationId,
        requestReason: reason ?? null,
      },
    });
  }
  createOperation(
    context: TransactionContext,
    data: {
      id: string;
      ownerUserId: string;
      operationType: OperationType;
      status: OperationStatus;
      amountXaf: bigint;
      reservationId: string | null;
    },
    simulatedOutcome: string,
  ) {
    return this.client(context).financialOperation.create({
      data: {
        ...data,
        attempt: { create: { providerReference: data.id, simulatedOutcome } },
        ...(data.operationType === 'WITHDRAWAL'
          ? { withdrawal: { create: {} } }
          : {}),
      },
    });
  }
  operation(id: string, context?: TransactionContext) {
    return this.client(context).financialOperation.findUnique({
      where: { id },
    });
  }
  transition(
    context: TransactionContext,
    id: string,
    status: OperationStatus,
    failureCode?: string,
  ) {
    const terminal = ['CONFIRMED', 'FAILED', 'REJECTED'].includes(status);
    const now = new Date();
    return this.client(context).financialOperation.update({
      where: { id },
      data: {
        status,
        failureCode: failureCode ?? null,
        completedAt: terminal ? now : null,
        responseExpiresAt: terminal
          ? new Date(now.getTime() + 86400_000)
          : null,
      },
    });
  }
  async review(
    context: TransactionContext,
    operationId: string,
    actorId: string,
    reason: string,
  ) {
    await this.client(context).withdrawalRequest.update({
      where: { operationId },
      data: {
        reviewedById: actorId,
        reviewReason: reason,
        reviewedAt: new Date(),
      },
    });
  }
  async enqueue(context: TransactionContext, operationId: string) {
    await this.client(context).outboxEvent.create({ data: { operationId } });
  }
  async reschedule(context: TransactionContext, operationId: string) {
    await this.client(context).outboxEvent.update({
      where: { operationId },
      data: {
        completedAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        attempts: 0,
        availableAt: new Date(),
      },
    });
  }
  async listOperations(
    ownerUserId: string | null,
    limit: number,
    cursor?: string,
  ) {
    const scope = ownerUserId
      ? { ownerUserId }
      : {
          operationType: 'WITHDRAWAL' as const,
          status: 'AWAITING_APPROVAL' as const,
        };
    const boundary = cursor
      ? await this.database.client.financialOperation.findFirst({
          where: { id: cursor, ...scope },
          select: { id: true, createdAt: true },
        })
      : null;
    if (cursor && !boundary)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Restart pagination with a current cursor',
      );
    return this.database.client.financialOperation.findMany({
      where: {
        ...scope,
        ...(boundary
          ? {
              OR: [
                { createdAt: { lt: boundary.createdAt } },
                { createdAt: boundary.createdAt, id: { lt: boundary.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
  balance(ownerUserId: string) {
    return this.database.client.walletAccount.findUnique({
      where: { ownerUserId },
    });
  }
  async hasUnresolvedOperations(
    context: TransactionContext,
    ownerUserId: string,
  ) {
    return (
      (await this.client(context).financialOperation.count({
        where: {
          ownerUserId,
          status: {
            in: [
              'AWAITING_APPROVAL',
              'PENDING_CONFIRMATION',
              'REVIEW_REQUIRED',
            ],
          },
        },
      })) > 0
    );
  }
  async history(ownerUserId: string, limit: number, cursor?: string) {
    const boundary = cursor
      ? await this.database.client.ledgerPosting.findFirst({
          where: { id: cursor, account: { ownerUserId } },
          select: { id: true, createdAt: true },
        })
      : null;
    if (cursor && !boundary)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Restart pagination with a current cursor',
      );
    const rows = await this.database.client.ledgerPosting.findMany({
      where: {
        account: { ownerUserId },
        ...(boundary
          ? {
              OR: [
                { createdAt: { lt: boundary.createdAt } },
                { createdAt: boundary.createdAt, id: { lt: boundary.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { transaction: { select: { description: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      amountXaf: row.amountXaf,
      createdAt: row.createdAt,
      ledgerTransactionId: row.ledgerTransactionId,
      description: row.transaction.description,
    }));
  }
  async dueEvents(limit: number) {
    const now = new Date();
    return (
      await this.database.client.outboxEvent.findMany({
        where: {
          completedAt: null,
          availableAt: { lte: now },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        orderBy: { availableAt: 'asc' },
        take: limit,
        select: { id: true },
      })
    ).map((row) => row.id);
  }
  async claim(eventId: string): Promise<PaymentWork | null> {
    return this.database.client.$transaction(
      async (client) => {
        const token = randomUUID();
        const now = new Date();
        const claimed = await client.outboxEvent.updateMany({
          where: {
            id: eventId,
            completedAt: null,
            availableAt: { lte: now },
            OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
          },
          data: {
            leaseToken: token,
            leaseExpiresAt: new Date(now.getTime() + 30_000),
            attempts: { increment: 1 },
          },
        });
        if (!claimed.count) return null;
        const event = await client.outboxEvent.findUniqueOrThrow({
          where: { id: eventId },
        });
        const operation = await client.financialOperation.findUniqueOrThrow({
          where: { id: event.operationId },
          include: { attempt: true },
        });
        if (
          !operation.attempt ||
          event.schemaVersion !== 1 ||
          event.eventType !== 'finance.payment_requested'
        )
          throw new Error('Unsupported persisted financial command');
        return {
          id: event.id,
          operationId: operation.id,
          leaseToken: token,
          attempts: event.attempts,
          providerReference: operation.attempt.providerReference,
          simulatedOutcome: operation.attempt.simulatedOutcome,
          operationType: operation.operationType,
          amountXaf: operation.amountXaf,
        };
      },
      { maxWait: 2000, timeout: 5000 },
    );
  }
  async ownsLease(context: TransactionContext, work: PaymentWork) {
    const rows = await this.client(context).$queryRaw<
      { lease_token: string | null; lease_expires_at: Date | null }[]
    >`SELECT lease_token, lease_expires_at FROM outbox_events WHERE id = ${work.id}::uuid FOR UPDATE`;
    return (
      rows[0]?.lease_token === work.leaseToken &&
      !!rows[0].lease_expires_at &&
      rows[0].lease_expires_at > new Date()
    );
  }
  async finishWork(
    context: TransactionContext,
    work: PaymentWork,
    retry: boolean,
  ) {
    const delay =
      Math.min(300_000, 1000 * 2 ** Math.min(work.attempts, 8)) +
      Math.floor(Math.random() * 1000);
    await this.client(context).outboxEvent.updateMany({
      where: { id: work.id, leaseToken: work.leaseToken },
      data: {
        leaseToken: null,
        leaseExpiresAt: null,
        ...(retry
          ? { availableAt: new Date(Date.now() + delay) }
          : { completedAt: new Date() }),
      },
    });
  }
}
