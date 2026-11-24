import { Inject, Injectable, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { RedisModule } from '../../platform/redis/redis.module.js';
import { RateLimitModule } from '../../platform/security/redis-rate-limit.js';
import { IdentityModule } from '../identity/identity.module.js';
import { RidesModule } from '../rides/rides.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CallingConfig } from './calling.config.js';
import { CallRelayConfig } from './call-relay.config.js';
import { CallRelayService } from './application/call-relay.service.js';
import { CallRelay } from './application/call-relay.port.js';
import { CoturnCallRelay } from './infrastructure/coturn-call-relay.js';
import { CallRepository } from './application/call.repository.js';
import { PrismaCallRepository } from './infrastructure/prisma-call.repository.js';
import { CallSignals } from './application/call-signals.port.js';
import { RedisCallSignals } from './infrastructure/redis-call-signals.js';
import { CallAccessService } from './application/call-access.service.js';
import { CallAdmissionService } from './application/call-admission.service.js';
import { CallRequestsService } from './application/call-requests.service.js';
import { CallStateService } from './application/call-state.service.js';
import { CallCreateService } from './application/call-create.service.js';
import { CallLifecycleService } from './application/call-lifecycle.service.js';
import { CallReadService } from './application/call-read.service.js';
import { CallReaperService } from './application/call-reaper.service.js';
import { CallSignalingService } from './application/call-signaling.service.js';
import { CallingController } from './presentation/calling.controller.js';
import { CallingFacade } from './calling.facade.js';
@Injectable()
class CallSchemaGate implements OnModuleInit {
  constructor(
    @Inject(CallingConfig) private readonly config: CallingConfig,
    @Inject(CallRepository) private readonly repo: CallRepository,
  ) {}
  async onModuleInit() {
    if (this.config.enabled) await this.repo.assertSchema();
  }
}
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    RateLimitModule,
    IdentityModule,
    RidesModule,
    DeliveriesModule,
    NotificationsModule,
  ],
  controllers: [CallingController],
  providers: [
    { provide: CallingConfig, useFactory: () => new CallingConfig() },
    { provide: CallRelayConfig, useFactory: () => new CallRelayConfig() },
    { provide: CallRelay, useClass: CoturnCallRelay },
    CallRelayService,
    CallSchemaGate,
    { provide: CallRepository, useClass: PrismaCallRepository },
    { provide: CallSignals, useClass: RedisCallSignals },
    CallAccessService,
    CallAdmissionService,
    CallRequestsService,
    CallStateService,
    CallCreateService,
    CallLifecycleService,
    CallReadService,
    CallReaperService,
    CallSignalingService,
    CallingFacade,
  ],
  exports: [CallingFacade, CallingConfig],
})
export class CallingModule {}
