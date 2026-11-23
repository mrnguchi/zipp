import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AuditPort,
  UnitOfWork,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import {
  IdentityRepository,
  IdentityCrypto,
  CodeDelivery,
} from './ports/identity-ports.js';
import type {
  IdentityUser,
  ChallengeRecord,
  Purpose,
} from './ports/identity-ports.js';
import {
  invalidChallenge,
  ApiError,
} from '../../../shared/errors/api-error.js';

export interface PreparedChallenge {
  record: Omit<ChallengeRecord, 'attempts' | 'usedAt'>;
  code: string;
}

@Injectable()
export class ChallengeService {
  constructor(
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(IdentityCrypto) private readonly crypto: IdentityCrypto,
    @Inject(CodeDelivery) private readonly delivery: CodeDelivery,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  response(id: string = randomUUID(), mfa = false) {
    return {
      challengeId: id,
      next: mfa ? ('two_factor' as const) : ('phone_code' as const),
      expiresIn: 300,
    };
  }
  async budget(phone: string, ip: string) {
    const key = this.crypto.digest('phone', phone);
    await this.limiter.consume([
      { key: `otp-minute:${key}`, limit: 1, windowMs: 60_000 },
      { key: `otp-hour:${key}`, limit: 5, windowMs: 3600_000 },
      {
        key: `otp-ip:${this.crypto.digest('ip', ip)}`,
        limit: 20,
        windowMs: 3600_000,
      },
    ]);
  }
  prepare(
    userId: string,
    purpose: Purpose,
    payload?: { passwordHash: string; displayName: string },
    chainExpiresAt = new Date(Date.now() + 600_000),
  ): PreparedChallenge {
    const id = randomUUID();
    const code = purpose === 'LOGIN_MFA' ? '' : this.crypto.code();
    return {
      code,
      record: {
        id,
        userId,
        purpose,
        codeHash: code
          ? this.crypto.digest(`otp:${purpose}:${id}`, code)
          : null,
        pendingPasswordHash: payload?.passwordHash ?? null,
        pendingDisplayName: payload?.displayName ?? null,
        expiresAt: new Date(
          Math.min(Date.now() + 300_000, chainExpiresAt.getTime()),
        ),
        chainExpiresAt,
      },
    };
  }
  async persist(
    context: TransactionContext,
    prepared: PreparedChallenge,
  ): Promise<void> {
    await this.repository.invalidateChallenges(
      context,
      prepared.record.userId,
      prepared.record.purpose,
      new Date(),
    );
    await this.repository.createChallenge(context, prepared.record);
  }
  async deliver(prepared: PreparedChallenge, phone: string) {
    if (prepared.record.purpose !== 'LOGIN_MFA') {
      try {
        await this.delivery.send({
          challengeId: prepared.record.id,
          purpose: prepared.record.purpose,
          phone,
          code: prepared.code,
          expiresAt: prepared.record.expiresAt,
        });
      } catch {
        await this.transactions.run((context) =>
          this.repository.consume(context, prepared.record.id, new Date()),
        );
        throw new ApiError(
          'DELIVERY_UNAVAILABLE',
          503,
          'Code delivery is temporarily unavailable',
        );
      }
    }
    return this.response(
      prepared.record.id,
      prepared.record.purpose === 'LOGIN_MFA',
    );
  }
  async complete<T>(
    id: string,
    purpose: Purpose,
    proof: (
      context: TransactionContext,
      user: IdentityUser,
      challenge: ChallengeRecord,
    ) => boolean | Promise<boolean>,
    action: (
      context: TransactionContext,
      user: IdentityUser,
      challenge: ChallengeRecord,
    ) => Promise<T>,
  ): Promise<T> {
    const initial = await this.repository.challenge(id);
    if (!initial) throw invalidChallenge();
    const result = await this.transactions.run(
      async (context): Promise<{ ok: false } | { ok: true; value: T }> => {
        await this.repository.lock(context, initial.userId);
        if (!(await this.repository.attempt(context, id, purpose, new Date())))
          return { ok: false };
        const [challenge, user] = await Promise.all([
          this.repository.challenge(id, context),
          this.repository.user(initial.userId, context),
        ]);
        if (
          !challenge ||
          !user ||
          user.status !== (purpose === 'ENROLL' ? 'PENDING' : 'ACTIVE') ||
          !(await proof(context, user, challenge))
        ) {
          await this.audit.record(
            context,
            null,
            'identity.challenge_rejected',
            initial.userId,
          );
          return { ok: false };
        }
        await this.repository.consume(context, id, new Date());
        return { ok: true, value: await action(context, user, challenge) };
      },
    );
    if (!result.ok) throw invalidChallenge();
    return result.value;
  }
  matchesSms(challenge: ChallengeRecord, code: string) {
    return this.crypto.matchesDigest(
      challenge.codeHash,
      this.crypto.digest(`otp:${challenge.purpose}:${challenge.id}`, code),
    );
  }
  async requireUsable(id: string, purpose: Purpose): Promise<void> {
    const challenge = await this.repository.challenge(id);
    if (
      !challenge ||
      challenge.purpose !== purpose ||
      challenge.usedAt ||
      challenge.attempts >= 5 ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.chainExpiresAt.getTime() <= Date.now()
    )
      throw invalidChallenge();
  }
  async resend(id: string, ip: string) {
    const initial = await this.repository.challenge(id);
    if (initial?.purpose === 'LOGIN_MFA') throw invalidChallenge();
    if (
      !initial ||
      initial.usedAt ||
      initial.chainExpiresAt.getTime() <= Date.now()
    )
      return this.response();
    const user = await this.repository.user(initial.userId);
    if (!user) return this.response();
    await this.budget(user.phone, ip);
    const next = this.prepare(
      user.id,
      initial.purpose,
      initial.pendingPasswordHash && initial.pendingDisplayName
        ? {
            passwordHash: initial.pendingPasswordHash,
            displayName: initial.pendingDisplayName,
          }
        : undefined,
      initial.chainExpiresAt,
    );
    const saved = await this.transactions.run(async (context) => {
      await this.repository.lock(context, user.id);
      const current = await this.repository.challenge(id, context);
      if (
        !current ||
        current.usedAt ||
        current.chainExpiresAt.getTime() <= Date.now()
      )
        return false;
      await this.persist(context, next);
      const currentUser = await this.repository.user(user.id, context);
      return current.purpose === 'ENROLL'
        ? currentUser?.status === 'PENDING'
        : currentUser?.status === 'ACTIVE' &&
            (current.purpose !== 'LOGIN_SMS' || !currentUser.twoFactorSecret);
    });
    return saved
      ? this.deliver(next, user.phone)
      : this.response(next.record.id);
  }
}
