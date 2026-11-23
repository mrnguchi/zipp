import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FinanceRepository } from './finance.repository.js';
import { FinancialRequestService } from './financial-request.service.js';
import { WalletService } from './wallet.service.js';
import { FinanceConfig } from '../finance.config.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { paymentAmount } from '../domain/money.js';
import type { OperationType } from '../contracts/finance-contracts.js';

@Injectable()
export class PaymentService {
  constructor(
    @Inject(FinanceRepository) private readonly repository: FinanceRepository,
    @Inject(FinancialRequestService)
    private readonly requests: FinancialRequestService,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(FinanceConfig) private readonly config: FinanceConfig,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}

  async create(actor: Actor, key: string, type: OperationType, amount: string) {
    this.config.assertEnabled();
    const amountXaf = paymentAmount(amount);
    const fingerprint = this.requests.fingerprint([type, amount, 'XAF']);
    return this.transactions.run(async (context) => {
      await this.repository.authorize(context, actor, type === 'WITHDRAWAL');
      const previous = await this.requests.replay(
        context,
        actor.userId,
        type,
        key,
        fingerprint,
      );
      if (previous) return previous;
      const id = randomUUID();
      const reservation =
        type === 'WITHDRAWAL'
          ? await this.wallets.reserve(
              context,
              actor.userId,
              `withdrawal:${id}`,
              amountXaf,
            )
          : null;
      const operation = await this.repository.createOperation(
        context,
        {
          id,
          ownerUserId: actor.userId,
          operationType: type,
          status:
            type === 'TOP_UP' ? 'PENDING_CONFIRMATION' : 'AWAITING_APPROVAL',
          amountXaf,
          reservationId: reservation?.id ?? null,
        },
        this.config.outcome,
      );
      await this.repository.remember(
        context,
        actor.userId,
        type,
        key,
        fingerprint,
        id,
      );
      if (type === 'TOP_UP') await this.repository.enqueue(context, id);
      await this.audit.record(
        context,
        actor.userId,
        `finance.${type.toLowerCase()}_requested`,
      );
      return operation;
    });
  }
  async review(
    actor: Actor,
    key: string,
    operationId: string,
    decision: 'approve' | 'reject',
    reason: string,
  ) {
    this.config.assertEnabled();
    const type = 'WITHDRAWAL_REVIEW';
    const fingerprint = this.requests.fingerprint([
      operationId,
      decision,
      reason,
    ]);
    return this.transactions.run(async (context) => {
      await this.repository.authorize(context, actor, true, true);
      const previous = await this.requests.replay(
        context,
        actor.userId,
        type,
        key,
        fingerprint,
      );
      if (previous) return previous;
      const initial = await this.repository.operation(operationId, context);
      if (!initial || initial.operationType !== 'WITHDRAWAL')
        throw new BusinessError('NOT_FOUND', 'Withdrawal not found');
      if (initial.ownerUserId === actor.userId)
        throw new BusinessError(
          'FORBIDDEN',
          'A different finance reviewer is required',
        );
      const account = await this.repository.wallet(
        context,
        initial.ownerUserId,
      );
      await this.repository.lockAccounts(context, [account.id]);
      const operation = await this.repository.operation(operationId, context);
      if (
        !operation ||
        operation.status !== 'AWAITING_APPROVAL' ||
        !operation.reservationId
      )
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Withdrawal has already been reviewed',
        );
      await this.repository.review(context, operationId, actor.userId, reason);
      if (decision === 'reject')
        await this.wallets.release(context, operation.reservationId);
      else await this.repository.enqueue(context, operationId);
      const updated = await this.repository.transition(
        context,
        operationId,
        decision === 'approve' ? 'PENDING_CONFIRMATION' : 'REJECTED',
      );
      await this.repository.remember(
        context,
        actor.userId,
        type,
        key,
        fingerprint,
        operationId,
        reason,
      );
      await this.audit.record(
        context,
        actor.userId,
        `finance.withdrawal_${decision}`,
        operation.ownerUserId,
      );
      return updated;
    });
  }
  async get(actor: Actor, id: string) {
    const row = await this.repository.operation(id);
    if (!row || row.ownerUserId !== actor.userId)
      throw new BusinessError('NOT_FOUND', 'Operation not found');
    return row;
  }
  async reconcile(
    actor: Actor,
    key: string,
    operationId: string,
    reason: string,
  ) {
    this.config.assertEnabled();
    const type = 'PAYMENT_RECONCILE';
    const fingerprint = this.requests.fingerprint([operationId, reason]);
    return this.transactions.run(async (context) => {
      await this.repository.authorize(context, actor, true, true);
      const previous = await this.requests.replay(
        context,
        actor.userId,
        type,
        key,
        fingerprint,
      );
      if (previous) return previous;
      const initial = await this.repository.operation(operationId, context);
      if (!initial) throw new BusinessError('NOT_FOUND', 'Operation not found');
      const wallet = await this.repository.wallet(context, initial.ownerUserId);
      await this.repository.lockAccounts(context, [wallet.id]);
      const operation = await this.repository.operation(operationId, context);
      if (!operation || operation.status !== 'REVIEW_REQUIRED')
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Only unresolved review operations can be reconciled',
        );
      // Re-query the same provider reference; staff cannot select success or credit money.
      await this.repository.reschedule(context, operationId);
      const updated = await this.repository.transition(
        context,
        operationId,
        'PENDING_CONFIRMATION',
      );
      await this.repository.remember(
        context,
        actor.userId,
        type,
        key,
        fingerprint,
        operationId,
        reason,
      );
      await this.audit.record(
        context,
        actor.userId,
        'finance.reconciliation_requested',
        operation.ownerUserId,
      );
      return updated;
    });
  }
}
