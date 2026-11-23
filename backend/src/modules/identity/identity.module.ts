import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { RateLimitModule } from '../../platform/security/redis-rate-limit.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { IdentityConfig } from './identity.config.js';
import { IdentityFacade } from './identity.facade.js';
import {
  IdentityRepository,
  IdentityCrypto,
  CodeDelivery,
} from './application/ports/identity-ports.js';
import { PrismaIdentityRepository } from './infrastructure/prisma-identity.repository.js';
import { NodeIdentityCrypto } from './infrastructure/identity-crypto.js';
import { LocalCodeDelivery } from './infrastructure/local-code-delivery.js';
import { SessionService } from './application/session.service.js';
import { ChallengeService } from './application/challenge.service.js';
import { RegistrationService } from './application/registration.service.js';
import { PasswordService } from './application/password.service.js';
import { TwoFactorService } from './application/two-factor.service.js';
import { IdentityController } from './presentation/identity.controller.js';

@Module({
  imports: [DatabaseModule, RateLimitModule, AccountsModule, FinanceModule],
  providers: [
    { provide: IdentityConfig, useFactory: () => new IdentityConfig() },
    { provide: IdentityRepository, useClass: PrismaIdentityRepository },
    { provide: IdentityCrypto, useClass: NodeIdentityCrypto },
    { provide: CodeDelivery, useClass: LocalCodeDelivery },
    SessionService,
    ChallengeService,
    RegistrationService,
    PasswordService,
    TwoFactorService,
    IdentityFacade,
  ],
  controllers: [IdentityController],
  exports: [IdentityFacade],
})
export class IdentityModule {}
