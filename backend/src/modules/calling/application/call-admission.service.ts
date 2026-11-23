import { Inject, Injectable } from '@nestjs/common';
import { CallingConfig } from '../calling.config.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import type { Actor } from '../../../shared/contracts/actor.js';
@Injectable()
export class CallAdmissionService {
  constructor(
    @Inject(CallingConfig) private readonly config: CallingConfig,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
  ) {}
  async admit(a: Actor, op: 'create' | 'action' | 'read' | 'signal') {
    this.config.assertEnabled();
    await this.limiter.consume([
      {
        key: `calling:${op}:${this.identity.pseudonym('actor', a.userId)}`,
        limit: op === 'create' ? 5 : op === 'action' ? 30 : 60,
        windowMs: 60000,
      },
    ]);
  }
}
