import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { parseEnvironment } from '../../src/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  DatabaseUnitOfWork,
  DatabaseAudit,
} from '../../src/platform/database/database-unit-of-work.js';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository.js';
import { FinancialRequestService } from '../../src/modules/finance/application/financial-request.service.js';
import { WalletService } from '../../src/modules/finance/application/wallet.service.js';
import { PaymentService } from '../../src/modules/finance/application/payment.service.js';
import { PaymentExecutionService } from '../../src/modules/finance/application/payment-execution.service.js';
import { LocalPaymentProvider } from '../../src/modules/finance/infrastructure/local-payment.provider.js';
import { FinanceConfig } from '../../src/modules/finance/finance.config.js';
import { CLEARING_ACCOUNT_ID } from '../../src/modules/finance/contracts/finance-contracts.js';
import type { Actor } from '../../src/shared/contracts/actor.js';

// Source only until explicit test authorization. Never run against development data.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error(
    'Financial integration requires the isolated service test project',
  );
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test')
  throw new Error('Financial integration requires zipp_test');

describe('real PostgreSQL financial invariants and recovery', () => {
  const database = new DatabaseService(config);
  const transactions = new DatabaseUnitOfWork(database);
  const audit = new DatabaseAudit(transactions);
  const repository = new PrismaFinanceRepository(database, transactions);
  const wallets = new WalletService(repository);
  const requests = new FinancialRequestService(repository);
  const local = new FinanceConfig({
    NODE_ENV: 'test',
    PAYMENTS_ENABLED: 'true',
    PAYMENT_ADAPTER: 'local',
  });
  const payments = new PaymentService(
    repository,
    requests,
    wallets,
    local,
    transactions,
    audit,
  );
  const execution = new PaymentExecutionService(
    repository,
    new LocalPaymentProvider(local),
    wallets,
    transactions,
    audit,
  );
  const users: string[] = [];
  beforeAll(() => database.onModuleInit());
  afterAll(async () => {
    try {
      for (const id of users) {
        await database.client.authSession.updateMany({
          where: { userId: id },
          data: { revokedAt: new Date() },
        });
        await database.client.user.update({
          where: { id },
          data: {
            status: 'DELETION_REQUESTED',
            deletionRequestedAt: new Date(),
          },
        });
      }
    } finally {
      await database.onModuleDestroy();
    }
  });
  async function actor(staff = false): Promise<Actor> {
    const user = await database.client.user.create({
      data: {
        phone: `+2376${randomInt(10_000_000, 100_000_000)}`,
        passwordHash: 'isolated-finance-fixture-no-login',
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        twoFactorSecret: 'isolated-enrollment-presence-only',
        roles: staff ? ['FINANCE'] : ['CUSTOMER'],
      },
    });
    users.push(user.id);
    const session = await database.client.authSession.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600_000),
        mfaVerifiedAt: new Date(),
      },
    });
    return {
      userId: user.id,
      sessionId: session.id,
      roles: user.roles,
      mfaEnabled: true,
      mfaVerifiedAt: session.mfaVerifiedAt,
    };
  }
  async function seed(owner: Actor, amount: bigint) {
    await transactions.run(async (context) => {
      const wallet = await repository.wallet(context, owner.userId);
      await repository.lockAccounts(context, [wallet.id, CLEARING_ACCOUNT_ID]);
      await repository.post(
        context,
        `fixture:${randomUUID()}`,
        'Isolated integration fixture',
        [
          { walletAccountId: wallet.id, amountXaf: amount },
          { walletAccountId: CLEARING_ACCOUNT_ID, amountXaf: -amount },
        ],
      );
    });
  }
  async function event(operationId: string) {
    return database.client.outboxEvent.findUniqueOrThrow({
      where: { operationId },
    });
  }
  it('serializes identical requests, conflicts on changed payload and posts one top-up', async () => {
    const owner = await actor();
    const key = randomUUID();
    const [first, retry] = await Promise.all([
      payments.create(owner, key, 'TOP_UP', '5000'),
      payments.create(owner, key, 'TOP_UP', '5000'),
    ]);
    expect(retry.id).toBe(first.id);
    await expect(
      payments.create(owner, key, 'TOP_UP', '6000'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const command = await event(first.id);
    await Promise.all([
      execution.execute(command.id),
      execution.execute(command.id),
    ]);
    await execution.execute(command.id);
    expect((await repository.balance(owner.userId))?.postedAmountXaf).toBe(
      5000n,
    );
    expect((await payments.get(owner, first.id)).status).toBe('CONFIRMED');
  });
  it('keeps expired request identities and returns the original operation ID', async () => {
    const owner = await actor();
    const key = randomUUID();
    const operation = await payments.create(owner, key, 'TOP_UP', '1000');
    await execution.execute((await event(operation.id)).id);
    const completedAt = new Date(Date.now() - 2 * 86400_000);
    await database.client.financialOperation.update({
      where: { id: operation.id },
      data: {
        completedAt,
        responseExpiresAt: new Date(completedAt.getTime() + 86400_000),
      },
    });
    await expect(
      payments.create(owner, key, 'TOP_UP', '1000'),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_EXPIRED',
      operationId: operation.id,
    });
    expect((await repository.balance(owner.userId))?.postedAmountXaf).toBe(
      1000n,
    );
  });
  it('prevents concurrent overspending and releases a rejected withdrawal', async () => {
    const owner = await actor();
    const reviewer = await actor(true);
    await seed(owner, 6000n);
    const results = await Promise.allSettled([
      payments.create(owner, randomUUID(), 'WITHDRAWAL', '4000'),
      payments.create(owner, randomUUID(), 'WITHDRAWAL', '4000'),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    const success = results.find((row) => row.status === 'fulfilled');
    if (success?.status !== 'fulfilled')
      throw new Error('Expected one withdrawal');
    expect((await repository.balance(owner.userId))?.reservedAmountXaf).toBe(
      4000n,
    );
    await payments.review(
      reviewer,
      randomUUID(),
      success.value.id,
      'reject',
      'Rejected in isolated integration scenario',
    );
    expect((await repository.balance(owner.userId))?.reservedAmountXaf).toBe(
      0n,
    );
    expect((await repository.balance(owner.userId))?.postedAmountXaf).toBe(
      6000n,
    );
  });
  it('enforces ownership, MFA, independent approval and current session revocation', async () => {
    const owner = await actor(true);
    const other = await actor();
    await seed(owner, 5000n);
    const withdrawal = await payments.create(
      owner,
      randomUUID(),
      'WITHDRAWAL',
      '1000',
    );
    await expect(
      payments.review(
        owner,
        randomUUID(),
        withdrawal.id,
        'approve',
        'Self approval is forbidden',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      payments.review(
        other,
        randomUUID(),
        withdrawal.id,
        'approve',
        'Customer approval is forbidden',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(payments.get(other, withdrawal.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await database.client.authSession.update({
      where: { id: other.sessionId },
      data: { mfaVerifiedAt: null },
    });
    await expect(
      payments.create(other, randomUUID(), 'WITHDRAWAL', '1000'),
    ).rejects.toMatchObject({ code: 'RECENT_MFA_REQUIRED' });
    await database.client.authSession.update({
      where: { id: owner.sessionId },
      data: { revokedAt: new Date() },
    });
    await expect(
      payments.create(owner, randomUUID(), 'TOP_UP', '1000'),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('settles and cumulatively refunds exactly once through a shared transaction', async () => {
    const owner = await actor();
    const driver = await actor();
    await seed(owner, 10000n);
    const reservation = await transactions.run((context) =>
      wallets.reserve(context, owner.userId, `booking:${randomUUID()}`, 2000n),
    );
    await transactions.run((context) =>
      wallets.capture(context, reservation.id, driver.userId, 1000),
    );
    await transactions.run((context) =>
      wallets.capture(context, reservation.id, driver.userId, 1000),
    );
    expect((await repository.balance(driver.userId))?.postedAmountXaf).toBe(
      1800n,
    );
    const key = randomUUID();
    await transactions.run((context) =>
      wallets.refund(context, reservation.id, key, 333n),
    );
    await transactions.run((context) =>
      wallets.refund(context, reservation.id, key, 333n),
    );
    await expect(
      transactions.run((context) =>
        wallets.refund(context, reservation.id, key, 334n),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await transactions.run((context) =>
      wallets.refund(context, reservation.id, randomUUID(), 1667n),
    );
    expect((await repository.balance(owner.userId))?.postedAmountXaf).toBe(
      10000n,
    );
    expect((await repository.balance(driver.userId))?.postedAmountXaf).toBe(0n);
    await expect(
      transactions.run((context) =>
        wallets.refund(context, reservation.id, randomUUID(), 1n),
      ),
    ).rejects.toMatchObject({ code: 'REFUND_LIMIT_EXCEEDED' });
  });
  it('retains a payout hold for unknown outcomes and resolves using the same reference', async () => {
    const owner = await actor();
    const reviewer = await actor(true);
    await seed(owner, 5000n);
    const ambiguous = new FinanceConfig({
      NODE_ENV: 'test',
      PAYMENTS_ENABLED: 'true',
      PAYMENT_ADAPTER: 'local',
      PAYMENT_LOCAL_OUTCOME: 'ambiguous',
    });
    const service = new PaymentService(
      repository,
      requests,
      wallets,
      ambiguous,
      transactions,
      audit,
    );
    const operation = await service.create(
      owner,
      randomUUID(),
      'WITHDRAWAL',
      '2000',
    );
    await payments.review(
      reviewer,
      randomUUID(),
      operation.id,
      'approve',
      'Approved isolated payout scenario',
    );
    const command = await event(operation.id);
    await execution.execute(command.id);
    expect((await payments.get(owner, operation.id)).status).toBe(
      'PENDING_CONFIRMATION',
    );
    expect((await repository.balance(owner.userId))?.reservedAmountXaf).toBe(
      2000n,
    );
    await database.client.outboxEvent.update({
      where: { id: command.id },
      data: { availableAt: new Date() },
    });
    await execution.execute(command.id);
    expect((await payments.get(owner, operation.id)).status).toBe('CONFIRMED');
    expect((await repository.balance(owner.userId))?.postedAmountXaf).toBe(
      3000n,
    );
    expect((await repository.balance(owner.userId))?.reservedAmountXaf).toBe(
      0n,
    );
  });
  it('rejects unbalanced postings and direct runtime balance manipulation', async () => {
    const owner = await actor();
    await seed(owner, 1000n);
    const wallet = await repository.balance(owner.userId);
    if (!wallet) throw new Error('Missing wallet');
    await expect(
      database.client
        .$executeRaw`UPDATE wallet_accounts SET posted_amount_xaf = 999999 WHERE id = ${wallet.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      database.client.$transaction(async (client) => {
        const header = await client.ledgerTransaction.create({
          data: {
            businessKey: `invalid:${randomUUID()}`,
            description: 'Unbalanced isolated fixture',
          },
        });
        await client.ledgerPosting.create({
          data: {
            ledgerTransactionId: header.id,
            walletAccountId: wallet.id,
            amountXaf: 1n,
          },
        });
      }),
    ).rejects.toThrow();
    expect((await repository.balance(owner.userId))?.postedAmountXaf).toBe(
      1000n,
    );
  });
});
