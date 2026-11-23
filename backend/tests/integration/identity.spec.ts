import 'reflect-metadata';
import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { parseEnvironment } from '../../src/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  DatabaseUnitOfWork,
  DatabaseAudit,
} from '../../src/platform/database/database-unit-of-work.js';
import { PrismaIdentityRepository } from '../../src/modules/identity/infrastructure/prisma-identity.repository.js';
import { NodeIdentityCrypto } from '../../src/modules/identity/infrastructure/identity-crypto.js';
import { SessionService } from '../../src/modules/identity/application/session.service.js';
import { AccountsFacade } from '../../src/modules/accounts/accounts.facade.js';
import { PrismaAccountsRepository } from '../../src/modules/accounts/infrastructure/prisma-accounts.repository.js';
import { identityTestConfig } from '../helpers/identity-config.js';

// Sources are written now; this file must only be executed after explicit authorization.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error(
    'Use the isolated test project for identity integration tests',
  );
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test')
  throw new Error('Identity integration requires zipp_test');

describe('authoritative identity state and ownership', () => {
  const database = new DatabaseService(config);
  const transactions = new DatabaseUnitOfWork(database);
  const audit = new DatabaseAudit(transactions);
  const repository = new PrismaIdentityRepository(database, transactions);
  const crypto = new NodeIdentityCrypto(identityTestConfig());
  const sessions = new SessionService(repository, crypto, transactions, audit);
  const accounts = new AccountsFacade(
    new PrismaAccountsRepository(database, transactions),
    transactions,
    audit,
  );
  const fixtures: string[] = [];
  beforeAll(() => database.onModuleInit());
  afterAll(async () => {
    try {
      // Keep test rows in the dedicated retained test volume; runtime cannot DELETE users/audit.
      for (const userId of fixtures)
        await transactions.run(async (context) => {
          await repository.lock(context, userId);
          await repository.revoke(context, userId, new Date());
          await repository.deletion(context, userId, new Date());
        });
    } finally {
      await database.onModuleDestroy();
    }
  });
  async function fixture() {
    const user = await database.client.user.create({
      data: {
        phone: `+2376${randomInt(10_000_000, 100_000_000)}`,
        passwordHash: 'integration-only-no-password-login',
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        roles: ['CUSTOMER'],
      },
    });
    fixtures.push(user.id);
    const grant = await transactions.run(async (context) => {
      await repository.lock(context, user.id);
      await accounts.provision(context, user.id, 'Isolated fixture');
      return sessions.grant(context, user);
    });
    return { user, grant };
  }
  it('revokes the refresh family on replay and denies its newly issued access token', async () => {
    const { grant } = await fixture();
    const rotated = await sessions.refresh(grant.refreshToken);
    expect((await sessions.authenticate(rotated.accessToken)).sessionId).toBe(
      grant.session.id,
    );
    await expect(sessions.refresh(grant.refreshToken)).rejects.toThrow();
    await expect(sessions.authenticate(rotated.accessToken)).rejects.toThrow();
    await expect(sessions.refresh(rotated.refreshToken)).rejects.toThrow();
  });
  it('serializes competing refreshes and commits reuse revocation', async () => {
    const { grant } = await fixture();
    const results = await Promise.allSettled([
      sessions.refresh(grant.refreshToken),
      sessions.refresh(grant.refreshToken),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled').length,
    ).toBe(1);
    expect(
      results.filter((result) => result.status === 'rejected').length,
    ).toBe(1);
    expect(
      (await repository.session(grant.session.id))?.revokedAt,
    ).not.toBeNull();
  });
  it('checks current status rather than trusting a previously issued JWT', async () => {
    const { user, grant } = await fixture();
    const pair = await sessions.present(grant);
    await database.client.user.update({
      where: { id: user.id },
      data: { status: 'SUSPENDED' },
    });
    await expect(sessions.authenticate(pair.accessToken)).rejects.toThrow();
  });
  it('keeps saved places owned and maintains a single Home shortcut', async () => {
    const first = await fixture();
    const second = await fixture();
    const input = {
      kind: 'HOME' as const,
      name: 'Home',
      label: 'Fixture location',
      latitude: 4.05,
      longitude: 9.7,
    };
    const place = await accounts.savePlace(first.user.id, input);
    const replacement = await accounts.savePlace(first.user.id, {
      ...input,
      label: 'Changed fixture',
    });
    expect(replacement.id).toBe(place.id);
    await expect(
      accounts.removePlace(second.user.id, place.id),
    ).rejects.toThrow();
    expect((await accounts.places(second.user.id, 50)).length).toBe(0);
    expect((await accounts.places(first.user.id, 50)).length).toBe(1);
  });
  it('can append audit records without permission to read or rewrite the audit table', async () => {
    const { user } = await fixture();
    await transactions.run((context) =>
      audit.record(context, user.id, 'integration.append_only'),
    );
    await expect(
      database.client.securityAudit.count({ where: { actorId: user.id } }),
    ).rejects.toThrow();
    await expect(
      database.client.securityAudit.deleteMany({ where: { actorId: user.id } }),
    ).rejects.toThrow();
  });
});
