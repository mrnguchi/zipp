import { Inject, Injectable } from '@nestjs/common';
import {
  AuditPort,
  UnitOfWork,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { IdentityRepository, IdentityCrypto } from './ports/identity-ports.js';
import type { IdentityUser, SessionRecord } from './ports/identity-ports.js';
import { invalidCredentials } from '../../../shared/errors/api-error.js';

export interface Grant {
  user: IdentityUser;
  session: SessionRecord;
  refreshToken: string;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(IdentityCrypto) private readonly crypto: IdentityCrypto,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  async grant(
    context: TransactionContext,
    user: IdentityUser,
    mfaAt: Date | null = null,
  ): Promise<Grant> {
    const refreshToken = this.crypto.token();
    const session = await this.repository.createSession(
      context,
      user.id,
      this.crypto.digest('refresh', refreshToken),
      new Date(),
      mfaAt,
    );
    await this.audit.record(context, user.id, 'identity.session_created');
    return { user, session, refreshToken };
  }
  async present(grant: Grant) {
    return {
      accessToken: await this.crypto.sign(grant.user.id, grant.session.id),
      refreshToken: grant.refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn: 600,
      sessionId: grant.session.id,
      user: {
        id: grant.user.id,
        phone: grant.user.phone,
        roles: grant.user.roles,
      },
    };
  }
  async authenticate(token: string): Promise<Actor> {
    const identity = await this.crypto.verify(token);
    const [session, user] = await Promise.all([
      this.repository.session(identity.sessionId),
      this.repository.user(identity.userId),
    ]);
    if (
      !session ||
      !user ||
      user.status !== 'ACTIVE' ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw invalidCredentials();
    return {
      userId: user.id,
      sessionId: session.id,
      roles: user.roles,
      mfaEnabled: user.twoFactorSecret !== null,
      mfaVerifiedAt: session.mfaVerifiedAt,
    };
  }
  async current(context: TransactionContext, actor: Actor): Promise<Actor> {
    const [session, user] = await Promise.all([
      this.repository.session(actor.sessionId, context),
      this.repository.user(actor.userId, context),
    ]);
    if (
      !session ||
      !user ||
      user.status !== 'ACTIVE' ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw invalidCredentials();
    return {
      userId: user.id,
      sessionId: session.id,
      roles: user.roles,
      mfaEnabled: !!user.twoFactorSecret,
      mfaVerifiedAt: session.mfaVerifiedAt,
    };
  }
  async refresh(token: string) {
    const hash = this.crypto.digest('refresh', token);
    const initial = await this.repository.refresh(hash);
    const initialSession = initial
      ? await this.repository.session(initial.sessionId)
      : null;
    if (!initialSession) throw invalidCredentials();
    const grant = await this.transactions.run(
      async (context): Promise<Grant | null> => {
        await this.repository.lock(context, initialSession.userId);
        const current = await this.repository.refresh(hash, context);
        const session = current
          ? await this.repository.session(current.sessionId, context)
          : null;
        const user = session
          ? await this.repository.user(session.userId, context)
          : null;
        const now = new Date();
        if (
          !current ||
          !session ||
          !user ||
          user.status !== 'ACTIVE' ||
          session.revokedAt ||
          session.expiresAt <= now ||
          current.expiresAt <= now
        )
          return null;
        if (current.usedAt) {
          // Return after committing revocation; throwing inside would roll it back.
          await this.repository.revoke(context, user.id, now, session.id);
          await this.audit.record(
            context,
            null,
            'identity.refresh_reuse',
            user.id,
          );
          return null;
        }
        const refreshToken = this.crypto.token();
        await this.repository.rotate(
          context,
          current.id,
          session,
          this.crypto.digest('refresh', refreshToken),
          now,
        );
        return { user, session, refreshToken };
      },
    );
    if (!grant) throw invalidCredentials();
    return this.present(grant);
  }
  async logout(actor: Actor, all = false): Promise<void> {
    await this.transactions.run(async (context) => {
      await this.repository.lock(context, actor.userId);
      await this.repository.revoke(
        context,
        actor.userId,
        new Date(),
        all ? undefined : actor.sessionId,
      );
      if (all)
        await this.repository.invalidateChallenges(
          context,
          actor.userId,
          undefined,
          new Date(),
        );
      await this.audit.record(
        context,
        actor.userId,
        all ? 'identity.all_sessions_revoked' : 'identity.session_revoked',
      );
    });
  }
}
