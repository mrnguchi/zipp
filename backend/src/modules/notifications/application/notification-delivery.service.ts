import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { AccountsFacade } from '../../accounts/accounts.facade.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationCrypto } from './notification-crypto.port.js';
import { NotificationProvider } from './notification-provider.port.js';
import type { NotificationProviderResult } from './notification-provider.port.js';
import { NotificationsConfig } from '../notifications.config.js';
import type {
  DeliveryWork,
  DeviceRecord,
  DeliveryRecord,
} from '../contracts/notification-records.js';
import {
  deviceCurrent,
  ownsDeliveryLease,
  retryDelayMs,
} from '../domain/notification-rules.js';
@Injectable()
export class NotificationDeliveryService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(AccountsFacade) private readonly accounts: AccountsFacade,
    @Inject(NotificationsRepository)
    private readonly repo: NotificationsRepository,
    @Inject(NotificationCrypto) private readonly crypto: NotificationCrypto,
    @Inject(NotificationProvider)
    private readonly provider: NotificationProvider,
    @Inject(NotificationsConfig) private readonly config: NotificationsConfig,
  ) {}
  due() {
    return this.config.dispatchEnabled ? this.repo.due() : Promise.resolve([]);
  }
  async materialize(id: string) {
    if (!this.config.dispatchEnabled) return;
    await this.tx.run(async (c) => {
      const first = await this.repo.intent(c, id);
      if (!first) return;
      const active = await this.identity.notificationEligible(
        c,
        first.recipientUserId,
      );
      const intent = await this.repo.intent(c, id, true),
        now = await this.repo.now(c);
      if (!intent || intent.completedAt) return;
      if (!active) {
        await this.repo.completeIntent(c, id, now);
        return;
      }
      const devices =
        intent.expiresAt > now &&
        (await this.accounts.notificationsEnabled(c, intent.recipientUserId))
          ? await this.repo.devices(c, intent.recipientUserId, now)
          : [];
      await this.repo.materialize(c, intent, devices, now);
    });
  }
  private async eligible(
    c: TransactionContext,
    d: DeliveryRecord,
    device: DeviceRecord | null,
    active: boolean,
    now: Date,
  ) {
    if (
      !active ||
      !device ||
      device.ownerUserId !== d.ownerUserId ||
      device.generation !== d.deviceGeneration ||
      !deviceCurrent(device, now)
    )
      return false;
    const intent = await this.repo.intent(c, d.notificationId);
    return (
      !!intent &&
      intent.expiresAt > now &&
      (await this.accounts.notificationsEnabled(c, d.ownerUserId))
    );
  }
  private async claim(id: string): Promise<DeliveryWork | null> {
    return this.tx.run(async (c) => {
      const first = await this.repo.delivery(c, id);
      if (!first) return null;
      const deviceFirst = await this.repo.device(c, first.deviceId);
      const active = await this.identity.notificationEligible(
        c,
        first.ownerUserId,
        deviceFirst?.sessionId,
      );
      const device = await this.repo.device(c, first.deviceId, true),
        delivery = await this.repo.delivery(c, id, true),
        now = await this.repo.now(c);
      if (
        !delivery ||
        delivery.status !== 'PENDING' ||
        delivery.availableAt > now ||
        (delivery.leaseExpiresAt && delivery.leaseExpiresAt > now)
      )
        return null;
      if (!(await this.eligible(c, delivery, device, active, now))) {
        await this.repo.finish(c, id, 'SUPPRESSED', now);
        return null;
      }
      if (delivery.attempts >= 8) {
        await this.repo.finish(c, id, 'REVIEW_REQUIRED', now);
        return null;
      }
      if (!device) return null;
      const leaseToken = randomUUID();
      return {
        delivery: await this.repo.claim(c, delivery, leaseToken, now),
        device,
        leaseToken,
      };
    });
  }
  private async preflight(work: DeliveryWork) {
    return this.tx.run(async (c) => {
      const active = await this.identity.notificationEligible(
        c,
        work.delivery.ownerUserId,
        work.device.sessionId,
      );
      const device = await this.repo.device(c, work.device.id, true),
        delivery = await this.repo.delivery(c, work.delivery.id, true),
        now = await this.repo.now(c);
      if (!delivery || !ownsDeliveryLease(delivery, work.leaseToken, now))
        return false;
      if (!(await this.eligible(c, delivery, device, active, now))) {
        await this.repo.finish(c, delivery.id, 'SUPPRESSED', now);
        return false;
      }
      return true;
    });
  }
  async dispatch(id: string) {
    if (!this.config.dispatchEnabled) return;
    const work = await this.claim(id);
    if (!work) return;
    let result: NotificationProviderResult = 'RETRY';
    try {
      if (!(await this.preflight(work))) return;
      const token = this.crypto.open(
        work.device.id,
        work.device.generation,
        work.device.tokenCiphertext ?? '',
      );
      const controller = new AbortController();
      let timer: NodeJS.Timeout | undefined;
      try {
        const deadline = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Notification adapter deadline'));
          }, 8000);
        });
        // Race bounds worker time even if an adapter ignores abort. Future real
        // providers still need ambiguity reconciliation; cancellation is not non-delivery.
        result = await Promise.race([
          this.provider.send(
            {
              deliveryId: work.delivery.id,
              notificationId: work.delivery.notificationId,
              deviceId: work.device.id,
              generation: work.device.generation,
              token,
            },
            controller.signal,
          ),
          deadline,
        ]);
      } finally {
        clearTimeout(timer);
      }
      if (!['CAPTURED', 'RETRY', 'INVALID_DEVICE'].includes(result))
        result = 'RETRY';
    } catch {
      /* Dependency/private endpoint details never enter queue/log/error payloads. */
    }
    await this.tx.run(async (c) => {
      await this.identity.lockUsers(c, [work.delivery.ownerUserId]);
      const device = await this.repo.device(c, work.device.id, true),
        delivery = await this.repo.delivery(c, id, true),
        now = await this.repo.now(c);
      if (!delivery || !ownsDeliveryLease(delivery, work.leaseToken, now))
        return;
      if (result === 'INVALID_DEVICE') {
        if (
          device &&
          device.generation === work.device.generation &&
          !device.revokedAt
        ) {
          device.revokedAt = now;
          device.tokenCiphertext = null;
          device.generation = Math.min(1000000, device.generation + 1);
          device.updatedAt = now;
          await this.repo.saveDevice(c, device, false);
        }
        await this.repo.finish(c, id, 'SUPPRESSED', now);
      } else if (result === 'CAPTURED')
        await this.repo.finish(c, id, 'CAPTURED', now);
      else
        await this.repo.finish(
          c,
          id,
          delivery.attempts >= 8 ? 'REVIEW_REQUIRED' : 'PENDING',
          now,
          new Date(
            now.getTime() +
              retryDelayMs(delivery.attempts, Math.floor(Math.random() * 1000)),
          ),
        );
    });
  }
}
