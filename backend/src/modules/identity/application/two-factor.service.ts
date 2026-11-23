import { Inject, Injectable } from '@nestjs/common';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { IdentityRepository, IdentityCrypto } from './ports/identity-ports.js';
import type { IdentityUser } from './ports/identity-ports.js';
import { ChallengeService } from './challenge.service.js';
import { SessionService } from './session.service.js';
import { PasswordService } from './password.service.js';
import {
  ApiError,
  invalidChallenge,
  invalidCredentials,
} from '../../../shared/errors/api-error.js';

export interface FactorProof {
  code: string;
  method: 'totp' | 'recovery';
}

@Injectable()
export class TwoFactorService {
  constructor(
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(IdentityCrypto) private readonly crypto: IdentityCrypto,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(ChallengeService) private readonly challenges: ChallengeService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  private async prove(
    context: TransactionContext,
    user: IdentityUser,
    proof: FactorProof,
  ): Promise<boolean> {
    if (
      !user.twoFactorSecret ||
      !(await this.repository.factorAttempt(context, user.id, new Date()))
    )
      return false;
    let valid = false;
    if (proof.method === 'recovery')
      valid = await this.repository.consumeRecovery(
        context,
        user.id,
        this.crypto.digest(`recovery:${user.id}`, proof.code),
        new Date(),
      );
    else {
      const step = await this.crypto.verifyTotp(
        user.id,
        user.twoFactorSecret,
        proof.code,
        user.lastTotpStep,
      );
      if (step !== null)
        valid = await this.repository.acceptTotp(context, user.id, step);
    }
    if (valid) await this.repository.factorSuccess(context, user.id);
    return valid;
  }
  async login(id: string, proof: FactorProof) {
    const grant = await this.challenges.complete(
      id,
      'LOGIN_MFA',
      (context, user) => this.prove(context, user, proof),
      (context, user) => this.sessions.grant(context, user, new Date()),
    );
    return this.sessions.present(grant);
  }
  async enroll(actor: Actor, password: string) {
    const original = await this.passwords.authorizePassword(actor, password);
    if (original.twoFactorSecret)
      throw new ApiError(
        'MFA_ALREADY_ENABLED',
        409,
        'Two-factor authentication is already enabled',
      );
    const enrollment = this.crypto.createTotp(original.id, original.phone);
    await this.transactions.run(async (context) => {
      await this.repository.lock(context, actor.userId);
      await this.sessions.current(context, actor);
      const current = await this.repository.user(actor.userId, context);
      if (
        !current ||
        current.passwordHash !== original.passwordHash ||
        current.twoFactorSecret
      )
        throw invalidCredentials();
      await this.repository.pendingMfa(
        context,
        actor.userId,
        enrollment.encrypted,
        new Date(Date.now() + 600_000),
      );
    });
    return { provisioningUri: enrollment.uri, expiresIn: 600 };
  }
  private async codes(context: TransactionContext, userId: string) {
    const codes = Array.from({ length: 10 }, () =>
      this.crypto.token().slice(0, 20),
    );
    await this.repository.recoveryCodes(
      context,
      userId,
      codes.map((code) => this.crypto.digest(`recovery:${userId}`, code)),
    );
    return codes;
  }
  async confirm(actor: Actor, code: string) {
    const codes = await this.transactions.run(async (context) => {
      await this.repository.lock(context, actor.userId);
      await this.sessions.current(context, actor);
      const user = await this.repository.user(actor.userId, context);
      if (
        !user ||
        user.twoFactorSecret ||
        !user.pendingTwoFactor ||
        !(await this.repository.enrollmentAttempt(context, user.id, new Date()))
      )
        return null;
      const step = await this.crypto.verifyTotp(
        user.id,
        user.pendingTwoFactor,
        code,
        -1,
      );
      if (step === null) return null; // Commit the durable failed enrollment attempt.
      await this.repository.enableMfa(
        context,
        user.id,
        user.pendingTwoFactor,
        step,
      );
      await this.repository.revoke(context, user.id, new Date());
      await this.repository.invalidateChallenges(
        context,
        user.id,
        undefined,
        new Date(),
      );
      await this.audit.record(context, user.id, 'identity.mfa_enabled');
      return this.codes(context, user.id);
    });
    if (!codes) throw invalidChallenge();
    return { recoveryCodes: codes, signInRequired: true };
  }
  async secureAction(
    actor: Actor,
    password: string,
    proof: FactorProof,
    mode: 'reauthenticate' | 'disable' | 'recovery',
  ) {
    const original = await this.passwords.authorizePassword(
      actor,
      password,
      false,
    );
    const result = await this.transactions.run(async (context) => {
      await this.repository.lock(context, actor.userId);
      await this.sessions.current(context, actor);
      const user = await this.repository.user(actor.userId, context);
      if (!user || user.passwordHash !== original.passwordHash) return null;
      if (
        mode === 'disable' &&
        user.roles.some((role) =>
          ['ADMIN', 'SUPPORT', 'FINANCE'].includes(role),
        )
      )
        throw new ApiError(
          'MFA_REQUIRED',
          403,
          'Staff accounts require two-factor authentication',
        );
      if (!(await this.prove(context, user, proof))) return null;
      let recoveryCodes: string[] | undefined;
      if (mode === 'disable') {
        await this.repository.disableMfa(context, user.id);
        await this.repository.revoke(context, user.id, new Date());
        await this.repository.invalidateChallenges(
          context,
          user.id,
          undefined,
          new Date(),
        );
      } else {
        if (mode === 'recovery')
          recoveryCodes = await this.codes(context, user.id);
        await this.repository.markMfa(context, actor.sessionId, new Date());
      }
      await this.audit.record(context, user.id, `identity.mfa_${mode}`);
      return {
        success: true,
        ...(recoveryCodes ? { recoveryCodes } : {}),
        signInRequired: mode === 'disable',
      };
    });
    if (!result) throw invalidChallenge();
    return result;
  }
}
