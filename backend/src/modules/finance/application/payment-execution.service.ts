import { Inject, Injectable } from '@nestjs/common';
import { FinanceRepository } from './finance.repository.js';
import { PaymentProvider } from './payment-provider.port.js';
import type { ProviderResult } from './payment-provider.port.js';
import { WalletService } from './wallet.service.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import { CLEARING_ACCOUNT_ID } from '../contracts/finance-contracts.js';

@Injectable()
export class PaymentExecutionService {
  constructor(
    @Inject(FinanceRepository) private readonly repository: FinanceRepository,
    @Inject(PaymentProvider) private readonly provider: PaymentProvider,
    @Inject(WalletService) private readonly wallets: WalletService,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}

  async execute(eventId: string): Promise<void> {
    const work = await this.repository.claim(eventId);
    if (!work) return;
    // No network adapter may run inside the transaction below. Exceptions are unknown outcomes.
    let result: ProviderResult;
    try {
      result = await this.provider.resolve({ ...work, attempt: work.attempts });
    } catch {
      result = 'unknown';
    }
    try {
      await this.transactions.run(async (context) => {
        const initial = await this.repository.operation(
          work.operationId,
          context,
        );
        if (!initial) throw new Error('Missing financial operation');
        const wallet = await this.repository.wallet(
          context,
          initial.ownerUserId,
        );
        await this.repository.lockAccounts(context, [
          wallet.id,
          CLEARING_ACCOUNT_ID,
        ]);
        if (!(await this.repository.ownsLease(context, work))) return;
        const operation = await this.repository.operation(
          work.operationId,
          context,
        );
        if (!operation) throw new Error('Missing financial operation');
        if (operation.status !== 'PENDING_CONFIRMATION') {
          await this.repository.finishWork(context, work, false);
          return;
        }
        if (result === 'pending' || result === 'unknown') {
          const review = work.attempts >= 8;
          if (review) {
            await this.repository.transition(
              context,
              operation.id,
              'REVIEW_REQUIRED',
              'PROVIDER_OUTCOME_UNRESOLVED',
            );
            await this.audit.record(
              context,
              null,
              'finance.payment_review_required',
              operation.ownerUserId,
            );
          }
          await this.repository.finishWork(context, work, !review);
          return;
        }
        if (operation.operationType === 'WITHDRAWAL') {
          if (!operation.reservationId)
            throw new Error('Withdrawal has no reservation');
          await this.wallets.release(context, operation.reservationId);
        }
        if (result === 'confirmed') {
          const sign = operation.operationType === 'TOP_UP' ? 1n : -1n;
          await this.repository.post(
            context,
            `payment:${operation.id}`,
            operation.operationType === 'TOP_UP'
              ? 'Wallet top-up'
              : 'Wallet withdrawal',
            [
              {
                walletAccountId: wallet.id,
                amountXaf: sign * operation.amountXaf,
              },
              {
                walletAccountId: CLEARING_ACCOUNT_ID,
                amountXaf: -sign * operation.amountXaf,
              },
            ],
          );
        }
        if (result === 'confirmed' && operation.reservationId)
          await this.repository.updateReservation(
            context,
            operation.reservationId,
            { status: 'CAPTURED' },
          );
        await this.repository.transition(
          context,
          operation.id,
          result === 'confirmed' ? 'CONFIRMED' : 'FAILED',
          result === 'failed' ? 'PROVIDER_CONFIRMED_FAILURE' : undefined,
        );
        await this.repository.finishWork(context, work, false);
        await this.audit.record(
          context,
          null,
          `finance.payment_${result}`,
          operation.ownerUserId,
        );
      });
    } catch {
      // Posting/constraint failures after provider confirmation remain unresolved.
      // A separate transaction cannot invent failure or release the original hold.
      await this.transactions.run(async (context) => {
        const initial = await this.repository.operation(
          work.operationId,
          context,
        );
        if (!initial) throw new Error('Missing financial operation');
        const wallet = await this.repository.wallet(
          context,
          initial.ownerUserId,
        );
        await this.repository.lockAccounts(context, [
          wallet.id,
          CLEARING_ACCOUNT_ID,
        ]);
        if (!(await this.repository.ownsLease(context, work))) return;
        const current = await this.repository.operation(
          work.operationId,
          context,
        );
        const review = work.attempts >= 8;
        if (current?.status === 'PENDING_CONFIRMATION' && review) {
          await this.repository.transition(
            context,
            current.id,
            'REVIEW_REQUIRED',
            'SETTLEMENT_REQUIRES_REVIEW',
          );
          await this.audit.record(
            context,
            null,
            'finance.settlement_review_required',
            current.ownerUserId,
          );
        }
        await this.repository.finishWork(
          context,
          work,
          current?.status === 'PENDING_CONFIRMATION' && !review,
        );
      });
    }
  }
}
