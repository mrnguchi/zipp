import { Inject, Injectable } from '@nestjs/common';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { CommunicationsConfig } from '../communications.config.js';
import type { Actor } from '../../../shared/contracts/actor.js';
@Injectable()
export class CommunicationAdmissionService {
  constructor(
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(CommunicationsConfig) private readonly config: CommunicationsConfig,
  ) {}
  async admit(
    actor: Actor,
    operation: 'send' | 'read' | 'create' | 'open' | 'ack' | 'status',
  ) {
    this.config.assertEnabled();
    const budgets = {
      send: 30,
      read: 120,
      create: 5,
      open: 20,
      ack: 60,
      status: 10,
    };
    await this.limiter.consume([
      {
        key: `communications:${operation}:${this.identity.pseudonym('actor', actor.userId)}`,
        limit: budgets[operation],
        windowMs: operation === 'create' ? 86400000 : 60000,
      },
    ]);
  }
}
