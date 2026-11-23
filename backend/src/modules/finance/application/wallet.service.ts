import { Inject, Injectable } from '@nestjs/common';
import { FinanceRepository } from './finance.repository.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { availableFunds, splitCapture, splitRefund } from '../domain/money.js';
import { PLATFORM_ACCOUNT_ID } from '../contracts/finance-contracts.js';

@Injectable()
export class WalletService {
  constructor(
    @Inject(FinanceRepository) private readonly repository: FinanceRepository,
  ) {}

  async reserve(
    context: TransactionContext,
    ownerUserId: string,
    businessKey: string,
    amountXaf: bigint,
  ) {
    const wallet = await this.repository.wallet(context, ownerUserId);
    await this.repository.lockAccounts(context, [wallet.id]);
    // Existing holds replay even if remaining available funds have since changed.
    const current = await this.repository.account(context, wallet.id);
    return this.repository.reserve(context, current, businessKey, amountXaf);
  }
  async release(context: TransactionContext, reservationId: string) {
    const initial = await this.repository.reservation(context, reservationId);
    await this.repository.lockAccounts(context, [initial.walletAccountId]);
    const row = await this.repository.reservation(context, reservationId);
    if (row.status === 'RELEASED') return;
    if (row.status !== 'RESERVED')
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Captured funds cannot be released',
      );
    await this.repository.adjustReserved(
      context,
      row.walletAccountId,
      -row.amountXaf,
    );
    await this.repository.updateReservation(context, row.id, {
      status: 'RELEASED',
    });
  }
  async capture(
    context: TransactionContext,
    reservationId: string,
    beneficiaryUserId: string,
    commissionBasisPoints: number,
    captureAmountXaf?: bigint,
  ) {
    const initial = await this.repository.reservation(context, reservationId);
    const beneficiary = await this.repository.wallet(
      context,
      beneficiaryUserId,
    );
    if (initial.walletAccountId === beneficiary.id)
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Payer and beneficiary must differ',
      );
    await this.repository.lockAccounts(context, [
      initial.walletAccountId,
      beneficiary.id,
      PLATFORM_ACCOUNT_ID,
    ]);
    const row = await this.repository.reservation(context, reservationId);
    const captured = captureAmountXaf ?? row.amountXaf;
    if (captured <= 0n || captured > row.amountXaf)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Capture exceeds reserved funds',
      );
    const split = splitCapture(captured, commissionBasisPoints);
    if (row.status === 'CAPTURED') {
      if (
        row.beneficiaryAccountId !== beneficiary.id ||
        (row.capturedAmountXaf ?? row.amountXaf) !== captured ||
        row.platformFeeXaf !== split.platformFeeXaf
      )
        throw new BusinessError(
          'IDEMPOTENCY_CONFLICT',
          'Capture has different settlement input',
        );
      return;
    }
    if (row.status !== 'RESERVED')
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Reservation is not available for capture',
      );
    await this.repository.adjustReserved(
      context,
      row.walletAccountId,
      -row.amountXaf,
    );
    await this.repository.post(
      context,
      `capture:${row.id}`,
      'Service settlement',
      [
        { walletAccountId: row.walletAccountId, amountXaf: -captured },
        {
          walletAccountId: beneficiary.id,
          amountXaf: split.beneficiaryAmountXaf,
        },
        {
          walletAccountId: PLATFORM_ACCOUNT_ID,
          amountXaf: split.platformFeeXaf,
        },
      ],
    );
    await this.repository.updateReservation(context, row.id, {
      status: 'CAPTURED',
      beneficiaryAccountId: beneficiary.id,
      platformFeeXaf: split.platformFeeXaf,
      capturedAmountXaf: captured,
    });
  }
  async refund(
    context: TransactionContext,
    reservationId: string,
    refundKey: string,
    amountXaf: bigint,
  ) {
    const initial = await this.repository.reservation(context, reservationId);
    if (!initial.beneficiaryAccountId)
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Only captured funds can be refunded',
      );
    await this.repository.lockAccounts(context, [
      initial.walletAccountId,
      initial.beneficiaryAccountId,
      PLATFORM_ACCOUNT_ID,
    ]);
    const row = await this.repository.reservation(context, reservationId);
    const businessKey = `refund:${row.id}:${refundKey}`;
    const previous = await this.repository.ledgerByKey(context, businessKey);
    if (previous) {
      if (
        previous.postings.find((p) => p.walletAccountId === row.walletAccountId)
          ?.amountXaf !== amountXaf
      )
        throw new BusinessError(
          'IDEMPOTENCY_CONFLICT',
          'Refund key has different input',
        );
      return previous.id;
    }
    if (
      row.status !== 'CAPTURED' ||
      row.platformFeeXaf === null ||
      !row.beneficiaryAccountId
    )
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Only captured funds can be refunded',
      );
    const split = splitRefund(
      row.capturedAmountXaf ?? row.amountXaf,
      row.platformFeeXaf,
      row.refundedAmountXaf,
      amountXaf,
    );
    for (const [id, amount] of [
      [row.beneficiaryAccountId, split.beneficiaryAmountXaf],
      [PLATFORM_ACCOUNT_ID, split.platformAmountXaf],
    ] as const) {
      const account = await this.repository.account(context, id);
      if (amount > 0n)
        availableFunds(
          account.postedAmountXaf,
          account.reservedAmountXaf,
          amount,
        );
    }
    const id = await this.repository.post(
      context,
      businessKey,
      'Service refund',
      [
        { walletAccountId: row.walletAccountId, amountXaf },
        {
          walletAccountId: row.beneficiaryAccountId,
          amountXaf: -split.beneficiaryAmountXaf,
        },
        {
          walletAccountId: PLATFORM_ACCOUNT_ID,
          amountXaf: -split.platformAmountXaf,
        },
      ],
    );
    await this.repository.updateReservation(context, row.id, {
      refundedAmountXaf: row.refundedAmountXaf + amountXaf,
    });
    return id;
  }
}
