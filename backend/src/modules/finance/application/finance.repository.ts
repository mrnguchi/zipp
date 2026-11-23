import type { Actor } from '../../../shared/contracts/actor.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  FinancialOperationRecord,
  OperationType,
  OperationStatus,
  WalletAccountRecord,
  ReservationRecord,
  Posting,
} from '../contracts/finance-contracts.js';

export interface RequestRecord {
  requestFingerprint: string;
  operationId: string;
}
export interface PaymentWork {
  id: string;
  operationId: string;
  leaseToken: string;
  attempts: number;
  providerReference: string;
  simulatedOutcome: string;
  operationType: OperationType;
  amountXaf: bigint;
}

export abstract class FinanceRepository {
  abstract operationsPage(
    context: TransactionContext,
    limit: number,
    afterId?: string,
  ): Promise<FinancialOperationRecord[]>;
  abstract authorize(
    context: TransactionContext,
    actor: Actor,
    sensitive: boolean,
    staff?: boolean,
  ): Promise<void>;
  abstract wallet(
    context: TransactionContext,
    ownerUserId: string,
  ): Promise<WalletAccountRecord>;
  abstract lockAccounts(
    context: TransactionContext,
    ids: readonly string[],
  ): Promise<void>;
  abstract account(
    context: TransactionContext,
    id: string,
  ): Promise<WalletAccountRecord>;
  abstract reserve(
    context: TransactionContext,
    wallet: WalletAccountRecord,
    businessKey: string,
    amountXaf: bigint,
  ): Promise<ReservationRecord>;
  abstract reservation(
    context: TransactionContext,
    id: string,
  ): Promise<ReservationRecord>;
  abstract updateReservation(
    context: TransactionContext,
    id: string,
    data: {
      status?: 'CAPTURED' | 'RELEASED';
      beneficiaryAccountId?: string;
      platformFeeXaf?: bigint;
      capturedAmountXaf?: bigint;
      refundedAmountXaf?: bigint;
    },
  ): Promise<void>;
  abstract adjustReserved(
    context: TransactionContext,
    accountId: string,
    delta: bigint,
  ): Promise<void>;
  abstract post(
    context: TransactionContext,
    businessKey: string,
    description: string,
    postings: readonly Posting[],
  ): Promise<string>;
  abstract ledgerByKey(
    context: TransactionContext,
    businessKey: string,
  ): Promise<{ id: string; postings: Posting[] } | null>;
  abstract request(
    context: TransactionContext,
    actorId: string,
    operationType: string,
    key: string,
  ): Promise<RequestRecord | null>;
  abstract remember(
    context: TransactionContext,
    actorId: string,
    operationType: string,
    key: string,
    fingerprint: string,
    operationId: string,
    reason?: string,
  ): Promise<void>;
  abstract createOperation(
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
  ): Promise<FinancialOperationRecord>;
  abstract operation(
    id: string,
    context?: TransactionContext,
  ): Promise<FinancialOperationRecord | null>;
  abstract transition(
    context: TransactionContext,
    id: string,
    status: OperationStatus,
    failureCode?: string,
  ): Promise<FinancialOperationRecord>;
  abstract review(
    context: TransactionContext,
    operationId: string,
    actorId: string,
    reason: string,
  ): Promise<void>;
  abstract enqueue(
    context: TransactionContext,
    operationId: string,
  ): Promise<void>;
  abstract reschedule(
    context: TransactionContext,
    operationId: string,
  ): Promise<void>;
  abstract listOperations(
    ownerUserId: string | null,
    limit: number,
    cursor?: string,
  ): Promise<FinancialOperationRecord[]>;
  abstract balance(ownerUserId: string): Promise<WalletAccountRecord | null>;
  abstract hasUnresolvedOperations(
    context: TransactionContext,
    ownerUserId: string,
  ): Promise<boolean>;
  abstract history(
    ownerUserId: string,
    limit: number,
    cursor?: string,
  ): Promise<
    {
      id: string;
      amountXaf: bigint;
      createdAt: Date;
      ledgerTransactionId: string;
      description: string;
    }[]
  >;
  abstract dueEvents(limit: number): Promise<string[]>;
  abstract claim(eventId: string): Promise<PaymentWork | null>;
  abstract ownsLease(
    context: TransactionContext,
    work: PaymentWork,
  ): Promise<boolean>;
  abstract finishWork(
    context: TransactionContext,
    work: PaymentWork,
    retry: boolean,
  ): Promise<void>;
}
