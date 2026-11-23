import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { z } from 'zod';
import { Access, CurrentActor } from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import { FinanceFacade } from '../finance.facade.js';
import {
  financialKey,
  paymentBody,
  financeQuery,
  withdrawalReviewBody,
  reconciliationBody,
} from '../contracts/finance.schemas.js';

@Controller('wallet')
export class FinanceController {
  constructor(@Inject(FinanceFacade) private readonly finance: FinanceFacade) {}
  @Get() balance(@CurrentActor() actor: Actor) {
    return this.finance.balance(actor);
  }
  @Get('history') history(
    @CurrentActor() actor: Actor,
    @Query(new SchemaPipe(financeQuery)) query: z.infer<typeof financeQuery>,
  ) {
    return this.finance.history(actor, query.limit, query.cursor);
  }
  @Get('operations') operations(
    @CurrentActor() actor: Actor,
    @Query(new SchemaPipe(financeQuery)) query: z.infer<typeof financeQuery>,
  ) {
    return this.finance.operations(actor, query.limit, query.cursor);
  }
  @Get('operations/:id') operation(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.finance.operation(actor, id);
  }
  @Post('top-ups') @HttpCode(202) topUp(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(paymentBody)) input: z.infer<typeof paymentBody>,
  ) {
    return this.finance.topUp(
      actor,
      new SchemaPipe(financialKey).transform(key),
      input.amountXaf,
    );
  }
  @Post('withdrawals') @HttpCode(202) withdraw(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(paymentBody)) input: z.infer<typeof paymentBody>,
  ) {
    return this.finance.withdraw(
      actor,
      new SchemaPipe(financialKey).transform(key),
      input.amountXaf,
    );
  }
}

@Controller('finance/operations')
@Access({ roles: ['FINANCE', 'ADMIN'] })
export class PaymentReconciliationController {
  constructor(@Inject(FinanceFacade) private readonly finance: FinanceFacade) {}
  @Post(':id/reconcile') @HttpCode(202) reconcile(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(reconciliationBody))
    input: z.infer<typeof reconciliationBody>,
  ) {
    return this.finance.reconcile(
      actor,
      new SchemaPipe(financialKey).transform(key),
      id,
      input.reason,
    );
  }
}

@Controller('finance/withdrawals')
@Access({ roles: ['FINANCE', 'ADMIN'] })
export class WithdrawalReviewController {
  constructor(@Inject(FinanceFacade) private readonly finance: FinanceFacade) {}
  @Get() pending(
    @CurrentActor() actor: Actor,
    @Query(new SchemaPipe(financeQuery)) query: z.infer<typeof financeQuery>,
  ) {
    return this.finance.pendingWithdrawals(actor, query.limit, query.cursor);
  }
  @Post(':id/review') @HttpCode(202) review(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(withdrawalReviewBody))
    input: z.infer<typeof withdrawalReviewBody>,
  ) {
    return this.finance.review(
      actor,
      new SchemaPipe(financialKey).transform(key),
      id,
      input.decision,
      input.reason,
    );
  }
}
