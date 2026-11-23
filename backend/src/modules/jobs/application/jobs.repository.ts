import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
export abstract class JobsRepository {
  abstract busyDriverIds(ids: string[]): Promise<string[]>;
  abstract create(
    context: TransactionContext,
    id: string,
    customerUserId: string,
    jobType: 'RIDE' | 'DELIVERY',
  ): Promise<void>;
  abstract lock(context: TransactionContext, id: string): Promise<void>;
  abstract driverBusy(
    context: TransactionContext,
    driverUserId: string,
  ): Promise<boolean>;
  abstract claim(
    context: TransactionContext,
    id: string,
    driverUserId: string,
  ): Promise<void>;
  abstract close(context: TransactionContext, id: string): Promise<void>;
  abstract activeForUser(
    context: TransactionContext,
    userId: string,
  ): Promise<boolean>;
}
