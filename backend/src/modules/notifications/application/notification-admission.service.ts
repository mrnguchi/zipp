import { Inject, Injectable } from '@nestjs/common';
import { NotificationsConfig } from '../notifications.config.js';
import { NotificationCrypto } from './notification-crypto.port.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import type { Actor } from '../../../shared/contracts/actor.js';
@Injectable()
export class NotificationAdmissionService {
  constructor(
    @Inject(NotificationsConfig) private readonly config: NotificationsConfig,
    @Inject(NotificationCrypto) private readonly crypto: NotificationCrypto,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
  ) {}
  async admit(actor: Actor, write = false) {
    this.config.assertEnabled();
    await this.limiter.consume([
      {
        key: `notifications:${write ? 'write' : 'read'}:${this.crypto.digest('actor', actor.userId)}`,
        limit: write ? 10 : 120,
        windowMs: 60000,
      },
    ]);
  }
}
