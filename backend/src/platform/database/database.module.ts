import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { DatabaseUnitOfWork, DatabaseAudit } from './database-unit-of-work.js';
import { UnitOfWork, AuditPort } from '../../shared/contracts/unit-of-work.js';

@Module({
  providers: [
    DatabaseService,
    DatabaseUnitOfWork,
    { provide: UnitOfWork, useExisting: DatabaseUnitOfWork },
    { provide: AuditPort, useClass: DatabaseAudit },
  ],
  exports: [DatabaseService, DatabaseUnitOfWork, UnitOfWork, AuditPort],
})
export class DatabaseModule {}
