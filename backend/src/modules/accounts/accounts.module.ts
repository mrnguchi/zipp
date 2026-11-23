import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { AccountsFacade } from './accounts.facade.js';
import { AccountsRepository } from './application/accounts.repository.js';
import { PrismaAccountsRepository } from './infrastructure/prisma-accounts.repository.js';
import { AccountsController } from './presentation/accounts.controller.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    AccountsFacade,
    { provide: AccountsRepository, useClass: PrismaAccountsRepository },
  ],
  controllers: [AccountsController],
  exports: [AccountsFacade],
})
export class AccountsModule {}
