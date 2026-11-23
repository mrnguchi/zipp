import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { DatabaseUnitOfWork } from '../../../platform/database/database-unit-of-work.js';
import { IdentityRepository } from '../application/ports/identity-ports.js';
import type {
  ChallengeRecord,
  Purpose,
  SessionRecord,
} from '../application/ports/identity-ports.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';

@Injectable()
export class PrismaIdentityRepository extends IdentityRepository {
  async accountStatus(
    context: TransactionContext,
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ) {
    await this.client(context).user.update({
      where: { id: userId },
      data: { status },
    });
  }
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(DatabaseUnitOfWork)
    private readonly transactions: DatabaseUnitOfWork,
  ) {
    super();
  }
  private client(context?: TransactionContext) {
    return context ? this.transactions.client(context) : this.database.client;
  }
  findPhone(phone: string, context?: TransactionContext) {
    return this.client(context).user.findUnique({ where: { phone } });
  }
  async driverRole(
    context: TransactionContext,
    userId: string,
    enabled: boolean,
  ): Promise<void> {
    const client = this.client(context);
    const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
    const roles = enabled
      ? [...user.roles.filter((role) => role !== 'DRIVER'), 'DRIVER' as const]
      : user.roles.filter((role) => role !== 'DRIVER');
    await client.user.update({ where: { id: userId }, data: { roles } });
  }
  user(id: string, context?: TransactionContext) {
    return this.client(context).user.findUnique({ where: { id } });
  }
  pending(context: TransactionContext, phone: string) {
    return this.client(context).user.upsert({
      where: { phone },
      create: { phone, roles: ['CUSTOMER'] },
      update: {},
    });
  }
  async lock(context: TransactionContext, userId: string): Promise<void> {
    // Canonical lock order for security mutations starts with the user row.
    await this.client(context)
      .$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  }
  async activate(
    context: TransactionContext,
    userId: string,
    passwordHash: string,
    now: Date,
  ) {
    await this.client(context).user.update({
      where: { id: userId },
      data: { passwordHash, status: 'ACTIVE', phoneVerifiedAt: now },
    });
  }
  challenge(id: string, context?: TransactionContext) {
    return this.client(context).authChallenge.findUnique({ where: { id } });
  }
  async createChallenge(
    context: TransactionContext,
    value: Omit<ChallengeRecord, 'attempts' | 'usedAt'>,
  ) {
    await this.client(context).authChallenge.create({ data: value });
  }
  async invalidateChallenges(
    context: TransactionContext,
    userId: string,
    purpose: Purpose | undefined,
    now: Date,
  ) {
    await this.client(context).authChallenge.updateMany({
      where: { userId, ...(purpose ? { purpose } : {}), usedAt: null },
      data: { usedAt: now },
    });
  }
  async attempt(
    context: TransactionContext,
    id: string,
    purpose: Purpose,
    now: Date,
  ) {
    const result = await this.client(context).authChallenge.updateMany({
      where: {
        id,
        purpose,
        usedAt: null,
        attempts: { lt: 5 },
        expiresAt: { gt: now },
        chainExpiresAt: { gt: now },
      },
      data: { attempts: { increment: 1 } },
    });
    return result.count === 1;
  }
  async consume(context: TransactionContext, id: string, now: Date) {
    await this.client(context).authChallenge.update({
      where: { id },
      data: { usedAt: now },
    });
  }
  async createSession(
    context: TransactionContext,
    userId: string,
    tokenHash: string,
    now: Date,
    mfaVerifiedAt: Date | null,
  ) {
    const client = this.client(context);
    const old = await client.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 4,
      select: { id: true },
    });
    if (old.length)
      await client.authSession.updateMany({
        where: { id: { in: old.map((row) => row.id) } },
        data: { revokedAt: now },
      });
    const expiresAt = new Date(now.getTime() + 30 * 86400_000);
    return client.authSession.create({
      data: {
        userId,
        expiresAt,
        mfaVerifiedAt,
        credentials: { create: { tokenHash, expiresAt } },
      },
    });
  }
  session(id: string, context?: TransactionContext) {
    return this.client(context).authSession.findUnique({ where: { id } });
  }
  refresh(tokenHash: string, context?: TransactionContext) {
    return this.client(context).refreshCredential.findUnique({
      where: { tokenHash },
    });
  }
  async rotate(
    context: TransactionContext,
    oldId: string,
    session: SessionRecord,
    tokenHash: string,
    now: Date,
  ) {
    const client = this.client(context);
    await client.refreshCredential.update({
      where: { id: oldId },
      data: { usedAt: now },
    });
    await client.refreshCredential.create({
      data: { sessionId: session.id, tokenHash, expiresAt: session.expiresAt },
    });
  }
  async revoke(
    context: TransactionContext,
    userId: string,
    now: Date,
    sessionId?: string,
  ) {
    await this.client(context).authSession.updateMany({
      where: {
        userId,
        ...(sessionId ? { id: sessionId } : {}),
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
  }
  async password(
    context: TransactionContext,
    userId: string,
    passwordHash: string,
  ) {
    await this.client(context).user.update({
      where: { id: userId },
      data: {
        passwordHash,
        pendingTwoFactor: null,
        pendingTwoFactorUntil: null,
        pendingMfaAttempts: 0,
      },
    });
  }
  async pendingMfa(
    context: TransactionContext,
    userId: string,
    pendingTwoFactor: string,
    pendingTwoFactorUntil: Date,
  ) {
    await this.client(context).user.update({
      where: { id: userId },
      data: { pendingTwoFactor, pendingTwoFactorUntil, pendingMfaAttempts: 0 },
    });
  }
  async enrollmentAttempt(
    context: TransactionContext,
    userId: string,
    now: Date,
  ) {
    return (
      (
        await this.client(context).user.updateMany({
          where: {
            id: userId,
            pendingTwoFactor: { not: null },
            pendingTwoFactorUntil: { gt: now },
            pendingMfaAttempts: { lt: 5 },
          },
          data: { pendingMfaAttempts: { increment: 1 } },
        })
      ).count === 1
    );
  }
  async factorAttempt(context: TransactionContext, userId: string, now: Date) {
    const client = this.client(context);
    const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
    const expired = !user.mfaFailureUntil || user.mfaFailureUntil <= now;
    if (!expired && user.mfaFailureCount >= 5) return false;
    await client.user.update({
      where: { id: userId },
      data: {
        mfaFailureCount: expired ? 1 : user.mfaFailureCount + 1,
        mfaFailureUntil: expired
          ? new Date(now.getTime() + 900_000)
          : user.mfaFailureUntil,
      },
    });
    return true;
  }
  async factorSuccess(context: TransactionContext, userId: string) {
    await this.client(context).user.update({
      where: { id: userId },
      data: { mfaFailureCount: 0, mfaFailureUntil: null },
    });
  }
  async enableMfa(
    context: TransactionContext,
    userId: string,
    twoFactorSecret: string,
    lastTotpStep: number,
  ) {
    await this.client(context).user.update({
      where: { id: userId },
      data: {
        twoFactorSecret,
        lastTotpStep,
        pendingTwoFactor: null,
        pendingTwoFactorUntil: null,
      },
    });
  }
  async acceptTotp(context: TransactionContext, userId: string, step: number) {
    return (
      (
        await this.client(context).user.updateMany({
          where: { id: userId, lastTotpStep: { lt: step } },
          data: { lastTotpStep: step },
        })
      ).count === 1
    );
  }
  async consumeRecovery(
    context: TransactionContext,
    userId: string,
    codeHash: string,
    now: Date,
  ) {
    return (
      (
        await this.client(context).recoveryCode.updateMany({
          where: { userId, codeHash, usedAt: null },
          data: { usedAt: now },
        })
      ).count === 1
    );
  }
  async recoveryCodes(
    context: TransactionContext,
    userId: string,
    hashes: string[],
  ) {
    const client = this.client(context);
    await client.recoveryCode.deleteMany({ where: { userId } });
    await client.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    });
  }
  async disableMfa(context: TransactionContext, userId: string) {
    await this.client(context).user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        pendingTwoFactor: null,
        pendingTwoFactorUntil: null,
        lastTotpStep: -1,
      },
    });
    await this.client(context).recoveryCode.deleteMany({ where: { userId } });
  }
  async markMfa(context: TransactionContext, sessionId: string, now: Date) {
    await this.client(context).authSession.update({
      where: { id: sessionId },
      data: { mfaVerifiedAt: now },
    });
  }
  async deletion(context: TransactionContext, userId: string, now: Date) {
    await this.client(context).user.update({
      where: { id: userId },
      data: { status: 'DELETION_REQUESTED', deletionRequestedAt: now },
    });
  }
}
