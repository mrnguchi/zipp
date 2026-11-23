import { RideLiveService } from './application/ride-live.service.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { DriversModule } from '../drivers/drivers.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { RateLimitModule } from '../../platform/security/redis-rate-limit.js';
import { RidesConfig } from './rides.config.js';
import { RideRepository } from './application/ride.repository.js';
import { PrismaRideRepository } from './infrastructure/prisma-ride.repository.js';
import { RideRequestService } from './application/ride-request.service.js';
import { RideAccessService } from './application/ride-access.service.js';
import { RideBookingService } from './application/ride-booking.service.js';
import { RideOfferService } from './application/ride-offer.service.js';
import { RideLifecycleService } from './application/ride-lifecycle.service.js';
import { RideReviewService } from './application/ride-review.service.js';
import { RideReadService } from './application/ride-read.service.js';
import { RideDispatchService } from './application/ride-dispatch.service.js';
import { RidesFacade } from './rides.facade.js';
import {
  RidesController,
  DriverRidesController,
  RideOperationsController,
} from './presentation/rides.controller.js';
@Module({
  imports: [
    DatabaseModule,
    IdentityModule,
    FinanceModule,
    DriversModule,
    PricingModule,
    JobsModule,
    RateLimitModule,
  ],
  controllers: [
    RidesController,
    DriverRidesController,
    RideOperationsController,
  ],
  providers: [
    RideLiveService,
    { provide: RidesConfig, useFactory: () => new RidesConfig() },
    { provide: RideRepository, useClass: PrismaRideRepository },
    RideRequestService,
    RideAccessService,
    RideBookingService,
    RideOfferService,
    RideLifecycleService,
    RideReviewService,
    RideReadService,
    RideDispatchService,
    RidesFacade,
  ],
  exports: [RidesFacade, RidesConfig],
})
export class RidesModule {}
