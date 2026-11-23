import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { PricingRepository } from './application/pricing.repository.js';
import { PrismaPricingRepository } from './infrastructure/prisma-pricing.repository.js';
import { RoutingProvider } from './application/routing.port.js';
import { FixtureRoutingProvider } from './infrastructure/fixture-routing.provider.js';
import { PricingConfig } from './pricing.config.js';
import { PricingService } from './application/pricing.service.js';
import { PricingFacade } from './pricing.facade.js';
import {
  PricingController,
  PricingAdminController,
} from './presentation/pricing.controller.js';
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [PricingController, PricingAdminController],
  providers: [
    { provide: PricingConfig, useFactory: () => new PricingConfig() },
    { provide: PricingRepository, useClass: PrismaPricingRepository },
    { provide: RoutingProvider, useClass: FixtureRoutingProvider },
    PricingService,
    PricingFacade,
  ],
  exports: [PricingFacade],
})
export class PricingModule {}
