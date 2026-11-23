import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { FinanceConfig } from './finance.config.js';
import { FinanceRepository } from './application/finance.repository.js';
import { PrismaFinanceRepository } from './infrastructure/prisma-finance.repository.js';
import { WalletService } from './application/wallet.service.js';
import { FinancialRequestService } from './application/financial-request.service.js';
import { PaymentService } from './application/payment.service.js';
import { PaymentExecutionService } from './application/payment-execution.service.js';
import { PaymentProvider } from './application/payment-provider.port.js';
import { LocalPaymentProvider } from './infrastructure/local-payment.provider.js';
import { FinanceFacade } from './finance.facade.js';
import {
  FinanceController,
  WithdrawalReviewController,
  PaymentReconciliationController,
} from './presentation/finance.controller.js';

@Module({
  imports: [DatabaseModule, JobsModule],
  controllers: [
    FinanceController,
    WithdrawalReviewController,
    PaymentReconciliationController,
  ],
  providers: [
    { provide: FinanceConfig, useFactory: () => new FinanceConfig() },
    { provide: FinanceRepository, useClass: PrismaFinanceRepository },
    { provide: PaymentProvider, useClass: LocalPaymentProvider },
    WalletService,
    FinancialRequestService,
    PaymentService,
    PaymentExecutionService,
    FinanceFacade,
  ],
  exports: [FinanceFacade, FinanceConfig],
})
export class FinanceModule {}
