import { Inject, Injectable, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { RateLimitModule } from '../../platform/security/redis-rate-limit.js';
import { IdentityModule } from '../identity/identity.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { NotificationsConfig } from './notifications.config.js';
import { NotificationsRepository } from './application/notifications.repository.js';
import { NotificationCrypto } from './application/notification-crypto.port.js';
import { NotificationProvider } from './application/notification-provider.port.js';
import { PrismaNotificationsRepository } from './infrastructure/prisma-notifications.repository.js';
import { NodeNotificationCrypto } from './infrastructure/notification-crypto.js';
import { CaptureNotificationProvider } from './infrastructure/capture-notification.provider.js';
import { NotificationAdmissionService } from './application/notification-admission.service.js';
import { NotificationDevicesService } from './application/notification-devices.service.js';
import { NotificationInboxService } from './application/notification-inbox.service.js';
import { NotificationDeliveryService } from './application/notification-delivery.service.js';
import { NotificationsFacade } from './notifications.facade.js';
import { NotificationsController } from './presentation/notifications.controller.js';
@Injectable()
class NotificationSchemaGate implements OnModuleInit {
  constructor(
    @Inject(NotificationsConfig) private readonly config: NotificationsConfig,
    @Inject(NotificationsRepository)
    private readonly repo: NotificationsRepository,
  ) {}
  async onModuleInit() {
    if (this.config.enabled) await this.repo.assertSchema();
  }
}
@Module({
  imports: [DatabaseModule, RateLimitModule, IdentityModule, AccountsModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NotificationsConfig,
      useFactory: () => new NotificationsConfig(),
    },
    {
      provide: NotificationsRepository,
      useClass: PrismaNotificationsRepository,
    },
    { provide: NotificationCrypto, useClass: NodeNotificationCrypto },
    { provide: NotificationProvider, useClass: CaptureNotificationProvider },
    NotificationSchemaGate,
    NotificationAdmissionService,
    NotificationDevicesService,
    NotificationInboxService,
    NotificationDeliveryService,
    NotificationsFacade,
  ],
  exports: [NotificationsFacade, NotificationsConfig],
})
export class NotificationsModule {}
