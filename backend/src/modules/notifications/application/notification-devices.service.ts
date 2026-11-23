import { Inject, Injectable } from '@nestjs/common';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationCrypto } from './notification-crypto.port.js';
import { NotificationAdmissionService } from './notification-admission.service.js';
import type {
  DeviceRegistration,
  DeviceRevocation,
} from '../contracts/notification.schemas.js';
import { deviceView } from '../contracts/notification-records.js';
import { assertGeneration } from '../domain/notification-rules.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class NotificationDevicesService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(NotificationsRepository)
    private readonly repo: NotificationsRepository,
    @Inject(NotificationCrypto) private readonly crypto: NotificationCrypto,
    @Inject(NotificationAdmissionService)
    private readonly admission: NotificationAdmissionService,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  async register(a: Actor, id: string, input: DeviceRegistration) {
    await this.admission.admit(a, true);
    id = id.toLowerCase();
    return this.tx.run(async (c) => {
      await this.identity.authorize(c, a);
      const now = await this.repo.now(c),
        current = await this.repo.device(c, id, true),
        proofHash = this.crypto.digest(`proof:${id}`, input.proof),
        tokenHash = this.crypto.digest('LOCAL:token', input.pushToken);
      if (
        current &&
        (current.ownerUserId !== a.userId ||
          !this.crypto.matches(current.proofHash, proofHash))
      )
        throw new BusinessError('NOT_FOUND', 'Device registration not found');
      if (current?.revokedAt)
        throw new BusinessError(
          'DEVICE_REVOKED',
          'Create a new installation identity',
        );
      const same =
        current &&
        current.expiresAt > now &&
        current.tokenHash === tokenHash &&
        current.sessionId === a.sessionId &&
        current.platform === input.platform;
      if (!same)
        assertGeneration(current?.generation ?? 0, input.expectedGeneration);
      const tokenOwner = await this.repo.tokenOwner(c, tokenHash);
      if (tokenOwner && tokenOwner !== id)
        throw new BusinessError(
          'DEVICE_BINDING_CONFLICT',
          'Endpoint registration unavailable',
        );
      if (
        (!current || current.expiresAt <= now) &&
        (await this.repo.devices(c, a.userId, now)).length >= 5
      )
        throw new BusinessError(
          'DEVICE_LIMIT',
          'Maximum active installations reached',
        );
      const generation = same
        ? current.generation
        : (current?.generation ?? 0) + 1;
      const device = {
        id,
        ownerUserId: a.userId,
        sessionId: a.sessionId,
        platform: input.platform,
        provider: input.provider,
        proofHash,
        tokenHash,
        tokenCiphertext: same
          ? current.tokenCiphertext
          : this.crypto.seal(id, generation, input.pushToken),
        generation,
        expiresAt: new Date(now.getTime() + 30 * 86400000),
        revokedAt: null,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      };
      await this.repo.saveDevice(c, device, !current);
      if (!same)
        await this.audit.record(
          c,
          a.userId,
          'notifications.device_registered',
          id,
        );
      return deviceView(device);
    });
  }
  async revoke(a: Actor, id: string, input: DeviceRevocation) {
    await this.admission.admit(a, true);
    return this.tx.run(async (c) => {
      await this.identity.authorize(c, a);
      const device = await this.repo.device(c, id, true),
        now = await this.repo.now(c);
      if (
        !device ||
        device.ownerUserId !== a.userId ||
        !this.crypto.matches(
          device.proofHash,
          this.crypto.digest(`proof:${device.id}`, input.proof),
        )
      )
        throw new BusinessError('NOT_FOUND', 'Device registration not found');
      if (!device.revokedAt) {
        if (device.generation !== input.expectedGeneration)
          throw new BusinessError(
            'DEVICE_VERSION_CONFLICT',
            'Reload the current device registration',
          );
        device.revokedAt = now;
        device.generation = Math.min(1000000, device.generation + 1);
        device.tokenCiphertext = null;
        device.updatedAt = now;
        await this.repo.saveDevice(c, device, false);
        await this.audit.record(
          c,
          a.userId,
          'notifications.device_revoked',
          device.id,
        );
      }
      return deviceView(device);
    });
  }
  async list(a: Actor) {
    await this.admission.admit(a);
    return this.tx.run(async (c) => {
      await this.identity.authorize(c, a);
      return {
        items: (
          await this.repo.devices(c, a.userId, await this.repo.now(c))
        ).map(deviceView),
      };
    });
  }
}
