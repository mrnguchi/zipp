import { Inject, Injectable } from '@nestjs/common';
import { SessionService } from './application/session.service.js';
import {
  IdentityCrypto,
  IdentityRepository,
} from './application/ports/identity-ports.js';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import type { Actor, Role } from '../../shared/contracts/actor.js';
import { hasRecentMfa } from '../../shared/contracts/actor.js';
import { BusinessError } from '../../shared/errors/business-error.js';

/** Public identity boundary: roles and session state are loaded from authoritative storage. */
@Injectable()
export class IdentityFacade {
  async operationsSummary(c: TransactionContext, a: Actor, id: string) {
    await this.authorize(c, a, ['SUPPORT', 'ADMIN'], true, [id]);
    const u = await this.repository.user(id, c);
    if (!u) throw new BusinessError('NOT_FOUND', 'Account not found');
    return { id: u.id, status: u.status, roles: u.roles };
  }
  /** Trusted operations boundary. The caller holds sorted actor/target locks and
   * has checked the review case and active-job/payment guards in this transaction. */
  async operationsStatus(
    c: TransactionContext,
    a: Actor,
    id: string,
    expected: 'ACTIVE' | 'SUSPENDED',
    next: 'ACTIVE' | 'SUSPENDED',
  ) {
    await this.authorize(c, a, ['ADMIN'], true, [id]);
    const u = await this.repository.user(id, c);
    if (!u) throw new BusinessError('NOT_FOUND', 'Account not found');
    if (
      id === a.userId ||
      u.roles.some((r) => ['ADMIN', 'FINANCE', 'SUPPORT'].includes(r))
    )
      throw new BusinessError(
        'FORBIDDEN',
        'Staff and self account changes are unavailable',
      );
    if (u.status !== expected || expected === next)
      throw new BusinessError(
        'ACCOUNT_STATE_CONFLICT',
        'Reload the account state',
      );
    await this.repository.accountStatus(c, id, next);
    if (next === 'SUSPENDED') await this.repository.revoke(c, id, new Date());
    return next;
  }
  /** Trusted worker boundary: uses storage only, never access-token signing/enrollment keys. */
  async notificationEligible(
    c: TransactionContext,
    userId: string,
    sessionId?: string,
  ) {
    await this.lockUsers(c, [userId]);
    const user = await this.repository.user(userId, c);
    if (!user || user.status !== 'ACTIVE') return false;
    if (!sessionId) return true;
    const session = await this.repository.session(sessionId, c);
    return (
      !!session &&
      session.userId === userId &&
      !session.revokedAt &&
      session.expiresAt > new Date()
    );
  }
  /** Under the caller's user lock; lets dispatch exclude late-registered contact phones without exposing PII. */
  async hasVerifiedPhone(
    context: TransactionContext,
    userId: string,
    phones: readonly string[],
  ) {
    const user = await this.repository.user(userId, context);
    return !!user && user.status === 'ACTIVE' && phones.includes(user.phone);
  }
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(IdentityCrypto) private readonly crypto: IdentityCrypto,
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
  ) {}
  authenticate(token: string) {
    return this.sessions.authenticate(token);
  }
  async lockUsers(
    context: TransactionContext,
    ids: readonly string[],
  ): Promise<void> {
    for (const id of [...new Set(ids)].sort())
      await this.repository.lock(context, id);
  }
  async assertAccountActive(
    context: TransactionContext,
    userId: string,
  ): Promise<void> {
    const user = await this.repository.user(userId, context);
    if (!user || user.status !== 'ACTIVE')
      throw new BusinessError('ACCOUNT_INACTIVE', 'Account is not active');
  }
  pseudonym(purpose: string, value: string) {
    return this.crypto.digest(purpose, value);
  }
  async authorize(
    context: TransactionContext,
    actor: Actor,
    roles: readonly Role[] = [],
    recentMfa = false,
    otherUserIds: readonly string[] = [],
  ): Promise<Actor> {
    for (const id of [...new Set([actor.userId, ...otherUserIds])].sort())
      await this.repository.lock(context, id);
    const current = await this.sessions.current(context, actor);
    if (roles.length && !roles.some((role) => current.roles.includes(role)))
      throw new BusinessError('FORBIDDEN', 'Permission denied');
    if (recentMfa && !hasRecentMfa(current))
      throw new BusinessError(
        'RECENT_MFA_REQUIRED',
        'Verify two-factor authentication again',
      );
    return current;
  }
  /** Trusted approval boundary; caller commits driver review and role in one transaction. */
  async setDriverRole(
    context: TransactionContext,
    userId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.repository.lock(context, userId);
    const user = await this.repository.user(userId, context);
    if (!user || (enabled && user.status !== 'ACTIVE'))
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Account is not eligible for driver approval',
      );
    await this.repository.driverRole(context, userId, enabled);
  }
  async validateDriverSession(
    context: TransactionContext,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const current = await this.sessions.current(context, {
      userId,
      sessionId,
      roles: [],
      mfaEnabled: false,
      mfaVerifiedAt: null,
    });
    if (!current.roles.includes('DRIVER'))
      throw new BusinessError(
        'DRIVER_NOT_ELIGIBLE',
        'Driver role is not active',
      );
  }
  async validateCustodySession(
    context: TransactionContext,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    await this.sessions.current(context, {
      userId,
      sessionId,
      roles: [],
      mfaEnabled: false,
      mfaVerifiedAt: null,
    });
  }
  async actorPhone(context: TransactionContext, actor: Actor) {
    await this.sessions.current(context, actor);
    const user = await this.repository.user(actor.userId, context);
    if (!user || user.status !== 'ACTIVE')
      throw new BusinessError('UNAUTHENTICATED', 'Sign in again');
    return user.phone;
  }
  async verifiedPhoneOwner(context: TransactionContext, phone: string) {
    const user = await this.repository.findPhone(phone, context);
    return user?.status === 'ACTIVE' ? user.id : null;
  }
}
