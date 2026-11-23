import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { JobsRepository } from './application/jobs.repository.js';
import { PrismaJobsRepository } from './infrastructure/prisma-jobs.repository.js';
import { JobsFacade } from './jobs.facade.js';
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: JobsRepository, useClass: PrismaJobsRepository },
    JobsFacade,
  ],
  exports: [JobsFacade],
})
export class JobsModule {}
