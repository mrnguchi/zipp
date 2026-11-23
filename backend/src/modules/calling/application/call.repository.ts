import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { CallRecord, CallOperation } from '../contracts/call-records.js';
import type { CallReceipt } from '../contracts/call.schemas.js';
export abstract class CallRepository {
  abstract assertSchema(): Promise<void>;
  abstract now(c: TransactionContext): Promise<Date>;
  abstract get(
    c: TransactionContext,
    id: string,
    lock?: boolean,
  ): Promise<CallRecord | null>;
  abstract active(
    c: TransactionContext,
    userId: string,
  ): Promise<CallRecord | null>;
  abstract create(c: TransactionContext, r: CallRecord): Promise<void>;
  abstract save(c: TransactionContext, r: CallRecord): Promise<void>;
  abstract claimAccounts(c: TransactionContext, r: CallRecord): Promise<void>;
  abstract releaseAccounts(c: TransactionContext, id: string): Promise<void>;
  abstract recentPair(
    c: TransactionContext,
    caller: string,
    callee: string,
    now: Date,
  ): Promise<boolean>;
  abstract command(
    c: TransactionContext,
    actor: string,
    op: CallOperation,
    key: string,
  ): Promise<(CallReceipt & { fingerprint: string }) | null>;
  abstract receipt(
    c: TransactionContext,
    actor: string,
    op: CallOperation,
    key: string,
    fingerprint: string,
    r: CallReceipt,
  ): Promise<void>;
  abstract event(
    c: TransactionContext,
    r: CallRecord,
    type: string,
    actor: string | null,
  ): Promise<void>;
  abstract candidates(): Promise<string[]>;
  abstract checked(c: TransactionContext, id: string, now: Date): Promise<void>;
}
