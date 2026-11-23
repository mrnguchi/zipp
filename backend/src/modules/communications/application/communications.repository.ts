import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  ThreadRecord,
  MessageRecord,
  CommandRecord,
  CommandReceipt,
} from '../contracts/communication-records.js';
import type {
  JobContext,
  TicketQuery,
} from '../contracts/communication.schemas.js';
export abstract class CommunicationsRepository {
  abstract assertSchema(): Promise<void>;
  abstract thread(
    c: TransactionContext,
    id: string,
  ): Promise<ThreadRecord | null>;
  abstract jobThread(
    c: TransactionContext,
    job: JobContext,
  ): Promise<ThreadRecord | null>;
  abstract lock(c: TransactionContext, id: string): Promise<ThreadRecord>;
  abstract create(c: TransactionContext, thread: ThreadRecord): Promise<void>;
  abstract openTicketCount(
    c: TransactionContext,
    owner: string,
  ): Promise<number>;
  abstract tickets(
    c: TransactionContext,
    owner: string | null,
    query: TicketQuery,
  ): Promise<ThreadRecord[]>;
  abstract command(
    c: TransactionContext,
    actor: string,
    operation: string,
    key: string,
  ): Promise<CommandRecord | null>;
  abstract receipt(
    c: TransactionContext,
    actor: string,
    operation: string,
    key: string,
    fingerprint: string,
    receipt: CommandReceipt,
  ): Promise<void>;
  abstract append(
    c: TransactionContext,
    thread: ThreadRecord,
    message: MessageRecord,
  ): Promise<void>;
  abstract messages(
    c: TransactionContext,
    id: string,
    after: number,
    limit: number,
  ): Promise<MessageRecord[]>;
  abstract readCursor(
    c: TransactionContext,
    id: string,
    actor: string,
  ): Promise<number>;
  abstract acknowledge(
    c: TransactionContext,
    id: string,
    actor: string,
    sequence: number,
  ): Promise<void>;
  abstract status(
    c: TransactionContext,
    id: string,
    status: 'OPEN' | 'RESOLVED',
    version: number,
  ): Promise<void>;
  abstract event(
    c: TransactionContext,
    threadId: string,
    version: number,
    type: string,
    actorId: string,
    sequence?: number,
    reason?: string,
  ): Promise<string>;
}
