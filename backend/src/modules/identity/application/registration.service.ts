import { Inject, Injectable } from '@nestjs/common';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import { AccountsFacade } from '../../accounts/accounts.facade.js';
import { IdentityRepository, IdentityCrypto } from './ports/identity-ports.js';
import { ChallengeService } from './challenge.service.js';
import { SessionService } from './session.service.js';
import { invalidChallenge } from '../../../shared/errors/api-error.js';

@Injectable()
export class RegistrationService {
  constructor(
    @Inject(IdentityRepository) private readonly repository: IdentityRepository,
    @Inject(IdentityCrypto) private readonly crypto: IdentityCrypto,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(ChallengeService) private readonly challenges: ChallengeService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AccountsFacade) private readonly accounts: AccountsFacade,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  async start(
    input: { phone: string; displayName: string; password: string },
    ip: string,
  ) {
    await this.challenges.budget(input.phone, ip);
    const passwordHash = await this.crypto.hashPassword(input.password);
    const prepared = await this.transactions.run(async (context) => {
      const user = await this.repository.pending(context, input.phone);
      await this.repository.lock(context, user.id);
      const current = await this.repository.user(user.id, context);
      if (!current) return null;
      const challenge = this.challenges.prepare(user.id, 'ENROLL', {
        passwordHash,
        displayName: input.displayName,
      });
      await this.challenges.persist(context, challenge);
      return { challenge, deliver: current.status === 'PENDING' };
    });
    return prepared
      ? prepared.deliver
        ? this.challenges.deliver(prepared.challenge, input.phone)
        : this.challenges.response(prepared.challenge.record.id)
      : this.challenges.response();
  }
  async verify(id: string, code: string) {
    const grant = await this.challenges.complete(
      id,
      'ENROLL',
      (_context, _user, challenge) =>
        this.challenges.matchesSms(challenge, code),
      async (context, user, challenge) => {
        if (!challenge.pendingPasswordHash || !challenge.pendingDisplayName)
          throw invalidChallenge();
        await this.repository.activate(
          context,
          user.id,
          challenge.pendingPasswordHash,
          new Date(),
        );
        await this.accounts.provision(
          context,
          user.id,
          challenge.pendingDisplayName,
        );
        await this.audit.record(context, user.id, 'identity.phone_verified');
        return this.sessions.grant(context, user);
      },
    );
    return this.sessions.present(grant);
  }
}
