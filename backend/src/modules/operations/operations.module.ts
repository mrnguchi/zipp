import { Inject, Injectable, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { RateLimitModule } from '../../platform/security/redis-rate-limit.js';
import { IdentityModule } from '../identity/identity.module.js';
import { DriversModule } from '../drivers/drivers.module.js';
import { RidesModule } from '../rides/rides.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { OperationsConfig } from './operations.config.js';
import { OperationsRepository } from './application/operations.repository.js';
import { PrismaOperationsRepository } from './infrastructure/prisma-operations.repository.js';
import { OperationsService } from './application/operations.service.js';
import { OperationsSubjectsService } from './application/operations-subjects.service.js';
import { OperationsController } from './presentation/operations.controller.js';
@Injectable()
class OperationsSchemaGate implements OnModuleInit {
  constructor(
    @Inject(OperationsConfig) private readonly config: OperationsConfig,
    @Inject(OperationsRepository) private readonly repo: OperationsRepository,
  ) {}
  async onModuleInit() {
    if (this.config.enabled) await this.repo.assertSchema();
  }
}
@Module({
  imports: [
    DatabaseModule,
    RateLimitModule,
    IdentityModule,
    DriversModule,
    RidesModule,
    DeliveriesModule,
    FinanceModule,
  ],
  controllers: [OperationsController],
  providers: [
    { provide: OperationsConfig, useFactory: () => new OperationsConfig() },
    { provide: OperationsRepository, useClass: PrismaOperationsRepository },
    OperationsSubjectsService,
    OperationsService,
    OperationsSchemaGate,
  ],
})
export class OperationsModule {}
