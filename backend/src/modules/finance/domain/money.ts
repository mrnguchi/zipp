import { BusinessError } from '../../../shared/errors/business-error.js';

export const MAX_PAYMENT_XAF = 1_000_000_000n;
export const MAX_BALANCE_XAF = 9_000_000_000_000n;

export function paymentAmount(value: string): bigint {
  if (!/^[1-9][0-9]{0,9}$/.test(value))
    throw new BusinessError(
      'VALIDATION_ERROR',
      'Amount must be a positive whole XAF amount',
    );
  const amount = BigInt(value);
  if (amount > MAX_PAYMENT_XAF)
    throw new BusinessError(
      'VALIDATION_ERROR',
      'Amount exceeds the operation limit',
    );
  return amount;
}

export function availableFunds(
  posted: bigint,
  reserved: bigint,
  amount: bigint,
): void {
  if (amount <= 0n || amount > MAX_PAYMENT_XAF)
    throw new BusinessError('VALIDATION_ERROR', 'Invalid XAF amount');
  if (posted - reserved < amount)
    throw new BusinessError(
      'INSUFFICIENT_FUNDS',
      'Insufficient available funds',
    );
}

export function splitCapture(amount: bigint, commissionBasisPoints: number) {
  if (
    !Number.isInteger(commissionBasisPoints) ||
    commissionBasisPoints < 0 ||
    commissionBasisPoints > 10000
  )
    throw new BusinessError('VALIDATION_ERROR', 'Invalid commission policy');
  const platformFeeXaf = (amount * BigInt(commissionBasisPoints)) / 10000n;
  return { platformFeeXaf, beneficiaryAmountXaf: amount - platformFeeXaf };
}

/** Cumulative allocation prevents repeated partial refunds from changing rounding. */
export function splitRefund(
  captured: bigint,
  fee: bigint,
  alreadyRefunded: bigint,
  amount: bigint,
) {
  if (amount <= 0n || alreadyRefunded + amount > captured)
    throw new BusinessError(
      'REFUND_LIMIT_EXCEEDED',
      'Refund exceeds remaining captured funds',
    );
  const beneficiaryTotal = captured - fee;
  const beneficiaryAmountXaf =
    ((alreadyRefunded + amount) * beneficiaryTotal) / captured -
    (alreadyRefunded * beneficiaryTotal) / captured;
  return {
    beneficiaryAmountXaf,
    platformAmountXaf: amount - beneficiaryAmountXaf,
  };
}
