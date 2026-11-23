import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../shared/contracts/actor.js';
import { hasRecentMfa } from '../../shared/contracts/actor.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import { WalletService } from './application/wallet.service.js';
import { PaymentService } from './application/payment.service.js';
import { PaymentExecutionService } from './application/payment-execution.service.js';
import { FinanceRepository } from './application/finance.repository.js';
import { operationView } from './contracts/finance-contracts.js';
import { JobsFacade } from '../jobs/jobs.facade.js';
import { paymentAmount } from './domain/money.js';

/** Trusted internal settlement boundary; never expose arbitrary postings as an HTTP API. */
@Injectable()
export class FinanceFacade {
  async operationsReport(
    c: TransactionContext,
    a: Actor,
    limit: number,
    afterId?: string,
  ) {
    await this.repository.authorize(c, a, true, true);
    const rows = await this.repository.operationsPage(c, limit, afterId);
    return {
      scope: 'PAGE' as const,
      currency: 'XAF' as const,
      requestedAmountXaf: rows.reduce((n, r) => n + r.amountXaf, 0n).toString(),
      items: rows.map((r) => ({
        id: r.id,
        ownerUserId: r.ownerUserId,
        operationType: r.operationType,
        status: r.status,
        amountXaf: r.amountXaf.toString(),
        createdAt: r.createdAt.toISOString(),
      })),
      nextAfterId: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
      providerReconciled: false as const,
    };
  }
  async operationsSummary(c: TransactionContext, a: Actor, id: string) {
    await this.repository.authorize(c, a, true, true);
    const r = await this.repository.operation(id, c);
    if (!r)
      throw new BusinessError('NOT_FOUND', 'Financial operation not found');
    return {
      id: r.id,
      ownerUserId: r.ownerUserId,
      operationType: r.operationType,
      status: r.status,
      amountXaf: r.amountXaf.toString(),
      currency: 'XAF' as const,
    };
  }
  /** Account-status administration cannot turn an ambiguous payment into failure. */
  async assertOperationsCanSuspend(c: TransactionContext, id: string) {
    await this.jobs.assertAccountCanClose(c, id);
    if (await this.repository.hasUnresolvedOperations(c, id))
      throw new BusinessError(
        'ACCOUNT_HAS_UNRESOLVED_FUNDS',
        'Resolve pending financial operations before suspension',
      );
  }
  constructor(
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(PaymentExecutionService)
    private readonly execution: PaymentExecutionService,
    @Inject(FinanceRepository) private readonly repository: FinanceRepository,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
  ) {}

  async balance(actor: Actor) {
    const wallet = await this.repository.balance(actor.userId);
    return {
      currency: 'XAF',
      postedAmountXaf: (wallet?.postedAmountXaf ?? 0n).toString(),
      reservedAmountXaf: (wallet?.reservedAmountXaf ?? 0n).toString(),
      availableAmountXaf: (
        (wallet?.postedAmountXaf ?? 0n) - (wallet?.reservedAmountXaf ?? 0n)
      ).toString(),
    };
  }
  async history(actor: Actor, limit: number, cursor?: string) {
    const rows = await this.repository.history(actor.userId, limit, cursor);
    return {
      items: rows.map((row) => ({
        ...row,
        amountXaf: row.amountXaf.toString(),
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }
  async operations(actor: Actor, limit: number, cursor?: string) {
    const rows = await this.repository.listOperations(
      actor.userId,
      limit,
      cursor,
    );
    return {
      items: rows.map(operationView),
      nextCursor: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }
  async pendingWithdrawals(actor: Actor, limit: number, cursor?: string) {
    if (
      !actor.roles.some((role) => role === 'FINANCE' || role === 'ADMIN') ||
      !hasRecentMfa(actor)
    )
      throw new BusinessError(
        'FORBIDDEN',
        'Finance permission and recent MFA required',
      );
    const rows = await this.repository.listOperations(null, limit, cursor);
    return {
      items: rows.map((row) => ({
        ...operationView(row),
        ownerUserId: row.ownerUserId,
      })),
      nextCursor: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }
  async operation(actor: Actor, id: string) {
    return operationView(await this.payments.get(actor, id));
  }
  async topUp(actor: Actor, key: string, amount: string) {
    return operationView(
      await this.payments.create(actor, key, 'TOP_UP', amount),
    );
  }
  async withdraw(actor: Actor, key: string, amount: string) {
    return operationView(
      await this.payments.create(actor, key, 'WITHDRAWAL', amount),
    );
  }
  async review(
    actor: Actor,
    key: string,
    id: string,
    decision: 'approve' | 'reject',
    reason: string,
  ) {
    return operationView(
      await this.payments.review(actor, key, id, decision, reason),
    );
  }
  async reconcile(actor: Actor, key: string, id: string, reason: string) {
    return operationView(await this.payments.reconcile(actor, key, id, reason));
  }
  async reserveFunds(
    context: TransactionContext,
    actor: Actor,
    businessKey: string,
    amount: string,
  ) {
    await this.repository.authorize(context, actor, false);
    return this.wallets.reserve(
      context,
      actor.userId,
      businessKey,
      paymentAmount(amount),
    );
  }
  releaseFunds(context: TransactionContext, reservationId: string) {
    return this.wallets.release(context, reservationId);
  }
  captureFunds(
    context: TransactionContext,
    reservationId: string,
    beneficiaryUserId: string,
    commissionBasisPoints: number,
    captureAmount?: string,
  ) {
    return this.wallets.capture(
      context,
      reservationId,
      beneficiaryUserId,
      commissionBasisPoints,
      captureAmount === undefined ? undefined : paymentAmount(captureAmount),
    );
  }
  refundFunds(
    context: TransactionContext,
    reservationId: string,
    refundKey: string,
    amount: string,
  ) {
    return this.wallets.refund(
      context,
      reservationId,
      refundKey,
      paymentAmount(amount),
    );
  }
  /** Caller holds the user lock; closure must not strand funds or unresolved payments. */
  async assertAccountCanClose(
    context: TransactionContext,
    ownerUserId: string,
  ): Promise<void> {
    await this.jobs.assertAccountCanClose(context, ownerUserId);
    const wallet = await this.repository.wallet(context, ownerUserId);
    await this.repository.lockAccounts(context, [wallet.id]);
    const current = await this.repository.account(context, wallet.id);
    if (
      current.postedAmountXaf !== 0n ||
      current.reservedAmountXaf !== 0n ||
      (await this.repository.hasUnresolvedOperations(context, ownerUserId))
    )
      throw new BusinessError(
        'ACCOUNT_HAS_UNRESOLVED_FUNDS',
        'Resolve wallet funds and pending payments before account deletion',
      );
  }
  duePaymentEvents(limit = 20) {
    return this.repository.dueEvents(limit);
  }
  executePaymentEvent(id: string) {
    return this.execution.execute(id);
  }
}
