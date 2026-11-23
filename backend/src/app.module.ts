import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { CallingModule } from './modules/calling/calling.module.js';
import { OperationsModule } from './modules/operations/operations.module.js';
import { CommunicationsModule } from './modules/communications/communications.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { DeliveriesModule } from './modules/deliveries/deliveries.module.js';
import { Module } from '@nestjs/common';
import { PlatformModule } from './platform/platform.module.js';
import { SecurityModule } from './platform/security/security.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { DriversModule } from './modules/drivers/drivers.module.js';
import { PricingModule } from './modules/pricing/pricing.module.js';
import { RidesModule } from './modules/rides/rides.module.js';

@Module({
  imports: [
    PlatformModule,
    SecurityModule,
    FinanceModule,
    DriversModule,
    PricingModule,
    RidesModule,
    DeliveriesModule,
    RealtimeModule,
    CommunicationsModule,
    NotificationsModule,
    CallingModule,
    OperationsModule,
  ],
})
export class AppModule {}
