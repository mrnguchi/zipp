import { Inject, Injectable } from '@nestjs/common';
import { AccountsRepository } from './application/accounts.repository.js';
import { AuditPort, UnitOfWork } from '../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import type {
  ProfileInput,
  PlaceInput,
} from './contracts/account-contracts.js';
import { ApiError } from '../../shared/errors/api-error.js';

@Injectable()
export class AccountsFacade {
  /** Internal dispatch policy read under the recipient lock, with no profile PII. */
  notificationsEnabled(context: TransactionContext, userId: string) {
    return this.repository.notificationsEnabled(context, userId);
  }
  constructor(
    @Inject(AccountsRepository) private readonly repository: AccountsRepository,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  provision(context: TransactionContext, userId: string, displayName: string) {
    return this.repository.provision(context, userId, displayName);
  }
  async profile(userId: string) {
    const profile = await this.repository.profile(userId);
    if (!profile) throw new ApiError('NOT_FOUND', 404, 'Profile not found');
    return profile;
  }
  update(userId: string, input: ProfileInput) {
    return this.transactions.run(async (context) => {
      const result = await this.repository.update(context, userId, input);
      await this.audit.record(context, userId, 'accounts.profile_updated');
      return result;
    });
  }
  places(userId: string, limit: number, cursor?: string) {
    return this.repository.places(userId, limit, cursor);
  }
  savePlace(userId: string, input: PlaceInput, id?: string) {
    return this.transactions.run(async (context) => {
      const place = await this.repository.savePlace(context, userId, input, id);
      if (!place) throw new ApiError('NOT_FOUND', 404, 'Saved place not found');
      await this.audit.record(context, userId, 'accounts.saved_place_updated');
      return place;
    });
  }
  async removePlace(userId: string, id: string): Promise<void> {
    await this.transactions.run(async (context) => {
      if (!(await this.repository.removePlace(context, userId, id)))
        throw new ApiError('NOT_FOUND', 404, 'Saved place not found');
      await this.audit.record(context, userId, 'accounts.saved_place_removed');
    });
  }
}
