import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { DriversConfig } from './drivers.config.js';
import { DriverRepository } from './application/driver.repository.js';
import { PrismaDriverRepository } from './infrastructure/prisma-driver.repository.js';
import { DocumentStorage } from './application/document-storage.port.js';
import { LocalDocumentStorage } from './infrastructure/local-document.storage.js';
import { DriverService } from './application/driver.service.js';
import { DriverDocumentService } from './application/driver-document.service.js';
import { DriversFacade } from './drivers.facade.js';
import {
  DriversController,
  DriverDownloadsController,
  DriverReviewController,
} from './presentation/drivers.controller.js';
@Module({
  imports: [DatabaseModule, IdentityModule, JobsModule],
  controllers: [
    DriversController,
    DriverDownloadsController,
    DriverReviewController,
  ],
  providers: [
    { provide: DriversConfig, useFactory: () => new DriversConfig() },
    { provide: DriverRepository, useClass: PrismaDriverRepository },
    { provide: DocumentStorage, useClass: LocalDocumentStorage },
    DriverService,
    DriverDocumentService,
    DriversFacade,
  ],
  exports: [DriversFacade],
})
export class DriversModule {}
