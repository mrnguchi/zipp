import { DeliveryDispatchWorker } from './platform/queues/delivery-dispatch.worker.js';
import { NotificationWorker } from './platform/queues/notification.worker.js';
import { CallReaperWorker } from './platform/queues/call-reaper.worker.js';
import { CallingModule } from './modules/calling/calling.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { DeliveriesModule } from './modules/deliveries/deliveries.module.js';
import { Module } from '@nestjs/common';
import { PlatformModule } from './platform/platform.module.js';
import { FoundationWorker } from './platform/queues/foundation-worker.js';
import { FinancialWorker } from './platform/queues/financial-worker.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { RidesModule } from './modules/rides/rides.module.js';
import { RideDispatchWorker } from './platform/queues/ride-dispatch.worker.js';

@Module({
  imports: [
    PlatformModule,
    FinanceModule,
    RidesModule,
    DeliveriesModule,
    NotificationsModule,
    CallingModule,
  ],
  providers: [
    FoundationWorker,
    FinancialWorker,
    RideDispatchWorker,
    DeliveryDispatchWorker,
    NotificationWorker,
    CallReaperWorker,
  ],
})
export class WorkerModule {}
