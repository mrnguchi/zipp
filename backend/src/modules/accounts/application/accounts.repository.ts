import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  PlaceInput,
  ProfileInput,
  PublicPlace,
  PublicProfile,
} from '../contracts/account-contracts.js';

export abstract class AccountsRepository {
  abstract notificationsEnabled(
    context: TransactionContext,
    userId: string,
  ): Promise<boolean>;
  abstract provision(
    context: TransactionContext,
    userId: string,
    displayName: string,
  ): Promise<void>;
  abstract profile(userId: string): Promise<PublicProfile | null>;
  abstract update(
    context: TransactionContext,
    userId: string,
    input: ProfileInput,
  ): Promise<PublicProfile>;
  abstract places(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<PublicPlace[]>;
  abstract savePlace(
    context: TransactionContext,
    userId: string,
    input: PlaceInput,
    id?: string,
  ): Promise<PublicPlace | null>;
  abstract removePlace(
    context: TransactionContext,
    userId: string,
    id: string,
  ): Promise<boolean>;
}
