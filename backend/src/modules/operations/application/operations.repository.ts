import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  CaseRecord,
  CaseEvent,
  CaseCommand,
} from '../contracts/operations-records.js';
import type {
  CaseQuery,
  Receipt,
  SubjectType,
} from '../contracts/operations.schemas.js';
export abstract class OperationsRepository {
  abstract assertSchema(): Promise<void>;
  abstract get(
    c: TransactionContext,
    id: string,
    lock?: boolean,
  ): Promise<CaseRecord | null>;
  abstract list(
    c: TransactionContext,
    types: readonly SubjectType[],
    q: CaseQuery,
  ): Promise<CaseRecord[]>;
  abstract create(c: TransactionContext, r: CaseRecord): Promise<void>;
  abstract save(c: TransactionContext, r: CaseRecord): Promise<void>;
  abstract event(c: TransactionContext, r: CaseEvent): Promise<void>;
  abstract events(
    c: TransactionContext,
    id: string,
    after: number,
    limit: number,
  ): Promise<CaseEvent[]>;
  abstract command(
    c: TransactionContext,
    actor: string,
    operation: string,
    key: string,
  ): Promise<CaseCommand | null>;
  abstract receipt(
    c: TransactionContext,
    actor: string,
    operation: string,
    key: string,
    fingerprint: string,
    r: Receipt,
  ): Promise<void>;
}
