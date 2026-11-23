import { DeliveryLiveService } from './application/delivery-live.service.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { DriversModule } from '../drivers/drivers.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { RateLimitModule } from '../../platform/security/redis-rate-limit.js';
import { DeliveriesConfig } from './deliveries.config.js';
import { DeliveryRepository } from './application/delivery.repository.js';
import { PrismaDeliveryRepository } from './infrastructure/prisma-delivery.repository.js';
import {
  PackagePhotoStorage,
  ContactCodeDelivery,
} from './application/delivery-providers.port.js';
import {
  LocalPackagePhotos,
  LocalContactCodeDelivery,
} from './infrastructure/local-delivery.providers.js';
import { DeliveriesFacade } from './deliveries.facade.js';
import {
  DeliveriesController,
  CourierDeliveriesController,
  DeliveryOperationsController,
  DeliveryPhotosController,
  PublicDeliveryTrackingController,
} from './presentation/deliveries.controller.js';
import { DeliveryRequestService } from './application/delivery-request.service.js';
import { DeliveryAccessService } from './application/delivery-access.service.js';
import { DeliveryBookingService } from './application/delivery-booking.service.js';
import { DeliveryPhotoService } from './application/delivery-photo.service.js';
import { DeliveryCodeService } from './application/delivery-code.service.js';
import { DeliveryLifecycleService } from './application/delivery-lifecycle.service.js';
import { DeliveryReviewService } from './application/delivery-review.service.js';
import { DeliveryReadService } from './application/delivery-read.service.js';
import { DeliveryTrackingService } from './application/delivery-tracking.service.js';
import { DeliveryOfferService } from './application/delivery-offer.service.js';
import { DeliveryDispatchService } from './application/delivery-dispatch.service.js';
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
    DeliveriesController,
    CourierDeliveriesController,
    DeliveryOperationsController,
    DeliveryPhotosController,
    PublicDeliveryTrackingController,
  ],
  providers: [
    DeliveryLiveService,
    { provide: DeliveriesConfig, useFactory: () => new DeliveriesConfig() },
    { provide: DeliveryRepository, useClass: PrismaDeliveryRepository },
    { provide: PackagePhotoStorage, useClass: LocalPackagePhotos },
    { provide: ContactCodeDelivery, useClass: LocalContactCodeDelivery },
    DeliveryRequestService,
    DeliveryAccessService,
    DeliveryBookingService,
    DeliveryPhotoService,
    DeliveryCodeService,
    DeliveryLifecycleService,
    DeliveryReviewService,
    DeliveryReadService,
    DeliveryTrackingService,
    DeliveryOfferService,
    DeliveryDispatchService,
    DeliveriesFacade,
  ],
  exports: [DeliveriesFacade, DeliveriesConfig],
})
export class DeliveriesModule {}
