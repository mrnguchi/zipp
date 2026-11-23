import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { AccountsRepository } from '../application/accounts.repository.js';
import type {
  PlaceInput,
  ProfileInput,
  PublicProfile,
} from '../contracts/account-contracts.js';
import { ApiError } from '../../../shared/errors/api-error.js';

const profileSelect = {
  displayName: true,
  language: true,
  preferredMode: true,
  notificationsEnabled: true,
  marketingConsent: true,
} as const;

@Injectable()
export class PrismaAccountsRepository extends AccountsRepository {
  async notificationsEnabled(context: TransactionContext, userId: string) {
    return (
      (
        await this.transactions.client(context).accountProfile.findUnique({
          where: { userId },
          select: { notificationsEnabled: true },
        })
      )?.notificationsEnabled ?? false
    );
  }
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(DatabaseUnitOfWork)
    private readonly transactions: DatabaseUnitOfWork,
  ) {
    super();
  }
  async provision(
    context: TransactionContext,
    userId: string,
    displayName: string,
  ) {
    await this.transactions.client(context).accountProfile.upsert({
      where: { userId },
      create: { userId, displayName },
      update: { displayName },
    });
  }
  profile(userId: string): Promise<PublicProfile | null> {
    return this.database.client.accountProfile.findUnique({
      where: { userId },
      select: profileSelect,
    });
  }
  private async owner(context: TransactionContext, userId: string) {
    const client = this.transactions.client(context);
    await client.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    if (
      !(await client.user.findFirst({
        where: { id: userId, status: 'ACTIVE' },
        select: { id: true },
      }))
    )
      throw new ApiError('ACCOUNT_INACTIVE', 403, 'Account is not active');
    return client;
  }
  async update(
    context: TransactionContext,
    userId: string,
    input: ProfileInput,
  ) {
    const client = await this.owner(context, userId);
    return client.accountProfile.update({
      where: { userId },
      data: input,
      select: profileSelect,
    });
  }
  async places(userId: string, limit: number, cursor?: string) {
    const records = await this.database.client.savedPlace.findMany({
      where: { userId, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return records.map(
      ({ id, kind, name, label, latitude, longitude, createdAt }) => ({
        id,
        kind,
        name,
        label,
        latitude,
        longitude,
        createdAt: createdAt.toISOString(),
      }),
    );
  }
  async savePlace(
    context: TransactionContext,
    userId: string,
    input: PlaceInput,
    id?: string,
  ) {
    // A user-row lock serializes count and Home/Work shortcut changes across replicas.
    const client = await this.owner(context, userId);
    const owned = id
      ? await client.savedPlace.findFirst({ where: { id, userId } })
      : null;
    if (id && !owned) return null;
    const shortcut =
      input.kind !== 'OTHER'
        ? await client.savedPlace.findFirst({
            where: { userId, kind: input.kind },
          })
        : null;
    if (shortcut && id && shortcut.id !== id)
      throw new ApiError(
        'SHORTCUT_EXISTS',
        409,
        'That shortcut already exists',
      );
    const target = owned ?? shortcut;
    if (!target && (await client.savedPlace.count({ where: { userId } })) >= 50)
      throw new ApiError('PLACE_LIMIT', 409, 'Saved-place limit reached');
    const record = target
      ? await client.savedPlace.update({
          where: { id: target.id, userId },
          data: input,
        })
      : await client.savedPlace.create({ data: { userId, ...input } });
    return {
      id: record.id,
      ...input,
      createdAt: record.createdAt.toISOString(),
    };
  }
  async removePlace(context: TransactionContext, userId: string, id: string) {
    const client = await this.owner(context, userId);
    return (
      (await client.savedPlace.deleteMany({ where: { userId, id } })).count ===
      1
    );
  }
}
