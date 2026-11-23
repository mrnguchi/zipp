import { Inject, Injectable, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { RateLimitModule } from '../../platform/security/redis-rate-limit.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RidesModule } from '../rides/rides.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { CommunicationsConfig } from './communications.config.js';
import { CommunicationsRepository } from './application/communications.repository.js';
import { PrismaCommunicationsRepository } from './infrastructure/prisma-communications.repository.js';
import { CommunicationAccessService } from './application/communication-access.service.js';
import { CommunicationAdmissionService } from './application/communication-admission.service.js';
import { CommunicationCommandService } from './application/communication-command.service.js';
import { CommunicationReadService } from './application/communication-read.service.js';
import { CommunicationsController } from './presentation/communications.controller.js';
@Injectable()
class CommunicationSchemaGate implements OnModuleInit {
  constructor(
    @Inject(CommunicationsConfig) private readonly config: CommunicationsConfig,
    @Inject(CommunicationsRepository)
    private readonly repo: CommunicationsRepository,
  ) {}
  async onModuleInit() {
    if (this.config.enabled) await this.repo.assertSchema();
  }
}
@Module({
  imports: [
    DatabaseModule,
    RateLimitModule,
    NotificationsModule,
    IdentityModule,
    RidesModule,
    DeliveriesModule,
  ],
  controllers: [CommunicationsController],
  providers: [
    {
      provide: CommunicationsConfig,
      useFactory: () => new CommunicationsConfig(),
    },
    {
      provide: CommunicationsRepository,
      useClass: PrismaCommunicationsRepository,
    },
    CommunicationSchemaGate,
    CommunicationAccessService,
    CommunicationAdmissionService,
    CommunicationCommandService,
    CommunicationReadService,
  ],
})
export class CommunicationsModule {}
