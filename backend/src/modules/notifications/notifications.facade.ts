import { Inject, Injectable } from '@nestjs/common';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import { NotificationsConfig } from './notifications.config.js';
import { NotificationsRepository } from './application/notifications.repository.js';
import { NotificationDeliveryService } from './application/notification-delivery.service.js';
import { NotificationCrypto } from './application/notification-crypto.port.js';
import type { Actor } from '../../shared/contracts/actor.js';
import { BusinessError } from '../../shared/errors/business-error.js';
@Injectable()
export class NotificationsFacade {
  constructor(
    @Inject(NotificationsConfig) private readonly config: NotificationsConfig,
    @Inject(NotificationsRepository)
    private readonly repo: NotificationsRepository,
    @Inject(NotificationDeliveryService)
    private readonly deliveries: NotificationDeliveryService,
    @Inject(NotificationCrypto) private readonly crypto: NotificationCrypto,
  ) {}
  /** Caller holds the owner user lock. No endpoint token/PII leaves this facade. */
  async assertCallDevice(
    c: TransactionContext,
    a: Actor,
    id: string,
    generation: number,
    proof: string,
    now: Date,
  ) {
    this.config.assertEnabled();
    const d = await this.repo.device(c, id);
    if (
      !d ||
      d.ownerUserId !== a.userId ||
      d.sessionId !== a.sessionId ||
      d.generation !== generation ||
      d.revokedAt ||
      d.expiresAt <= now ||
      !this.crypto.matches(
        d.proofHash,
        this.crypto.digest(`proof:${d.id}`, proof),
      )
    )
      throw new BusinessError('NOT_FOUND', 'Call device unavailable');
  }
  async currentCallDevice(
    c: TransactionContext,
    owner: string,
    session: string,
    id: string,
    generation: number,
    now: Date,
  ) {
    const d = await this.repo.device(c, id);
    return (
      !!d &&
      d.ownerUserId === owner &&
      d.sessionId === session &&
      d.generation === generation &&
      !d.revokedAt &&
      d.expiresAt > now
    );
  }
  due() {
    return this.deliveries.due();
  }
  materialize(id: string) {
    return this.deliveries.materialize(id);
  }
  dispatch(id: string) {
    return this.deliveries.dispatch(id);
  }
  /** Trusted source only; caller owns sorted recipient identity locks and atomic source event. */
  async communicationActivity(
    c: TransactionContext,
    sourceEventId: string,
    actorUserId: string,
    participantIds: readonly string[],
  ) {
    if (!this.config.enabled) return;
    const recipients = [...new Set(participantIds)]
      .filter((id) => id !== actorUserId)
      .sort();
    if (recipients.length > 4)
      throw new Error('Notification fanout exceeds source participant bound');
    for (const recipient of recipients)
      await this.repo.enqueue(c, sourceEventId, recipient);
  }
}
