export type OperationType = 'TOP_UP' | 'WITHDRAWAL';
export const PLATFORM_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
export const CLEARING_ACCOUNT_ID = '00000000-0000-4000-8000-000000000002';
export type OperationStatus =
  | 'AWAITING_APPROVAL'
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'FAILED'
  | 'REJECTED'
  | 'REVIEW_REQUIRED';
export interface FinancialOperationRecord {
  id: string;
  ownerUserId: string;
  operationType: OperationType;
  status: OperationStatus;
  amountXaf: bigint;
  reservationId: string | null;
  failureCode: string | null;
  completedAt: Date | null;
  responseExpiresAt: Date | null;
  createdAt: Date;
}
export interface WalletAccountRecord {
  id: string;
  ownerUserId: string | null;
  accountType: 'USER' | 'PLATFORM' | 'CLEARING';
  postedAmountXaf: bigint;
  reservedAmountXaf: bigint;
}
export interface ReservationRecord {
  capturedAmountXaf: bigint | null;
  id: string;
  walletAccountId: string;
  businessKey: string;
  amountXaf: bigint;
  refundedAmountXaf: bigint;
  status: 'RESERVED' | 'RELEASED' | 'CAPTURED';
  beneficiaryAccountId: string | null;
  platformFeeXaf: bigint | null;
}
export interface Posting {
  walletAccountId: string;
  amountXaf: bigint;
}
export interface OperationView {
  id: string;
  operationType: OperationType;
  status: OperationStatus;
  amountXaf: string;
  currency: 'XAF';
  failureCode: string | null;
  createdAt: string;
  completedAt: string | null;
}
export const operationView = (
  row: FinancialOperationRecord,
): OperationView => ({
  id: row.id,
  operationType: row.operationType,
  status: row.status,
  amountXaf: row.amountXaf.toString(),
  currency: 'XAF',
  failureCode: row.failureCode,
  createdAt: row.createdAt.toISOString(),
  completedAt: row.completedAt?.toISOString() ?? null,
});
