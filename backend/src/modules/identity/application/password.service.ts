import { Inject, Injectable } from '@nestjs/common';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { hasRecentMfa } from '../../../shared/contracts/actor.js';
import { IdentityRepository, IdentityCrypto } from './ports/identity-ports.js';
import { ChallengeService } from './challenge.service.js';
import { SessionService } from './session.service.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import {
  ApiError,
  invalidCredentials,
} from '../../../shared/errors/api-error.js';

@Injectable()
export class PasswordService {
  constructor(
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(IdentityCrypto) private readonly crypto: IdentityCrypto,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(ChallengeService) private readonly challenges: ChallengeService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
  ) {}
  async login(phone: string, password: string, ip: string) {
    await this.limiter.consume([
      {
        key: `password:${this.crypto.digest('phone', phone)}`,
        limit: 5,
        windowMs: 900_000,
      },
      {
        key: `password-ip:${this.crypto.digest('ip', ip)}`,
        limit: 30,
        windowMs: 900_000,
      },
    ]);
    const original = await this.repository.findPhone(phone);
    const valid = await this.crypto.verifyPassword(
      password,
      original?.passwordHash ?? null,
    );
    if (!valid || !original || original.status !== 'ACTIVE') {
      await this.transactions.run((context) =>
        this.audit.record(
          context,
          null,
          'identity.password_rejected',
          original?.id,
        ),
      );
      throw invalidCredentials();
    }
    if (!original.twoFactorSecret) await this.challenges.budget(phone, ip);
    const challenge = await this.transactions.run(async (context) => {
      await this.repository.lock(context, original.id);
      const user = await this.repository.user(original.id, context);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.passwordHash !== original.passwordHash ||
        user.twoFactorSecret !== original.twoFactorSecret
      )
        throw invalidCredentials();
      const prepared = this.challenges.prepare(
        user.id,
        user.twoFactorSecret ? 'LOGIN_MFA' : 'LOGIN_SMS',
      );
      await this.challenges.persist(context, prepared);
      return prepared;
    });
    return this.challenges.deliver(challenge, phone);
  }
  async verifyLogin(id: string, code: string) {
    const grant = await this.challenges.complete(
      id,
      'LOGIN_SMS',
      (_context, user, challenge) =>
        !user.twoFactorSecret && this.challenges.matchesSms(challenge, code),
      (context, user) => this.sessions.grant(context, user),
    );
    return this.sessions.present(grant);
  }
  async reset(phone: string, ip: string) {
    await this.challenges.budget(phone, ip);
    const result = await this.transactions.run(async (context) => {
      // Decoy challenges have the same resend/budget behavior as deliverable ones.
      // A PENDING user can never complete a password-reset challenge.
      const user = await this.repository.pending(context, phone);
      await this.repository.lock(context, user.id);
      const current = await this.repository.user(user.id, context);
      const prepared = this.challenges.prepare(user.id, 'PASSWORD_RESET');
      await this.challenges.persist(context, prepared);
      return { prepared, deliver: current?.status === 'ACTIVE' };
    });
    return result.deliver
      ? this.challenges.deliver(result.prepared, phone)
      : this.challenges.response(result.prepared.record.id);
  }
  async confirmReset(
    id: string,
    code: string,
    password: string,
  ): Promise<void> {
    // Reject random/exhausted IDs cheaply without revealing the account's status.
    await this.challenges.requireUsable(id, 'PASSWORD_RESET');
    const hash = await this.crypto.hashPassword(password);
    await this.challenges.complete(
      id,
      'PASSWORD_RESET',
      (_context, _user, challenge) =>
        this.challenges.matchesSms(challenge, code),
      async (context, user) => {
        await this.repository.password(context, user.id, hash);
        await this.repository.revoke(context, user.id, new Date());
        await this.repository.invalidateChallenges(
          context,
          user.id,
          undefined,
          new Date(),
        );
        await this.audit.record(context, user.id, 'identity.password_reset');
      },
    );
  }
  async authorizePassword(actor: Actor, password: string, requireMfa = true) {
    await this.limiter.consume([
      {
        key: `reauth:${this.crypto.digest('actor', actor.userId)}`,
        limit: 5,
        windowMs: 900_000,
      },
    ]);
    const user = await this.repository.user(actor.userId);
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await this.crypto.verifyPassword(password, user.passwordHash))
    )
      throw invalidCredentials();
    if (requireMfa && user.twoFactorSecret && !hasRecentMfa(actor))
      throw new ApiError(
        'RECENT_MFA_REQUIRED',
        403,
        'Verify two-factor authentication again',
      );
    return user;
  }
  async change(
    actor: Actor,
    currentPassword: string,
    password: string,
  ): Promise<void> {
    const original = await this.authorizePassword(actor, currentPassword);
    const hash = await this.crypto.hashPassword(password);
    await this.transactions.run(async (context) => {
      await this.repository.lock(context, actor.userId);
      const actorNow = await this.sessions.current(context, actor);
      if (actorNow.mfaEnabled && !hasRecentMfa(actorNow))
        throw new ApiError(
          'RECENT_MFA_REQUIRED',
          403,
          'Verify two-factor authentication again',
        );
      const current = await this.repository.user(actor.userId, context);
      if (
        !current ||
        current.status !== 'ACTIVE' ||
        current.passwordHash !== original.passwordHash
      )
        throw invalidCredentials();
      await this.repository.password(context, actor.userId, hash);
      await this.repository.revoke(context, actor.userId, new Date());
      await this.repository.invalidateChallenges(
        context,
        actor.userId,
        undefined,
        new Date(),
      );
      await this.audit.record(
        context,
        actor.userId,
        'identity.password_changed',
      );
    });
  }
  async deleteAccount(actor: Actor, password: string): Promise<void> {
    const original = await this.authorizePassword(actor, password);
    await this.transactions.run(async (context) => {
      await this.repository.lock(context, actor.userId);
      const actorNow = await this.sessions.current(context, actor);
      if (actorNow.mfaEnabled && !hasRecentMfa(actorNow))
        throw new ApiError(
          'RECENT_MFA_REQUIRED',
          403,
          'Verify two-factor authentication again',
        );
      const user = await this.repository.user(actor.userId, context);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.passwordHash !== original.passwordHash
      )
        throw invalidCredentials();
      await this.finance.assertAccountCanClose(context, actor.userId);
      await this.repository.deletion(context, actor.userId, new Date());
      await this.repository.revoke(context, actor.userId, new Date());
      await this.repository.invalidateChallenges(
        context,
        actor.userId,
        undefined,
        new Date(),
      );
      await this.audit.record(
        context,
        actor.userId,
        'identity.deletion_requested',
      );
    });
  }
}
