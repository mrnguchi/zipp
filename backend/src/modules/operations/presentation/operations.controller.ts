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
import { OperationsService } from '../application/operations.service.js';
import {
  openCaseBody,
  reviewCaseBody,
  accountCaseBody,
  operationsKey,
  subjectType,
  subjectQuery,
  caseQuery,
  eventQuery,
  reportQuery,
} from '../contracts/operations.schemas.js';
const key = (v: unknown) =>
  new SchemaPipe(operationsKey).transform(v).toLowerCase();
@Controller('operations')
@Access({ roles: ['SUPPORT', 'FINANCE', 'ADMIN'] })
export class OperationsController {
  constructor(
    @Inject(OperationsService) private readonly service: OperationsService,
  ) {}
  @Get('capabilities') capabilities(@CurrentActor() a: Actor) {
    return this.service.capabilities(a);
  }
  @Get('subjects/:type/:id') subject(
    @CurrentActor() a: Actor,
    @Param('type', new SchemaPipe(subjectType))
    type: z.infer<typeof subjectType>,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new SchemaPipe(subjectQuery)) q: z.infer<typeof subjectQuery>,
  ) {
    return this.service.subject(a, type, id, q.reasonCode);
  }
  @Get('cases') list(
    @CurrentActor() a: Actor,
    @Query(new SchemaPipe(caseQuery)) q: z.infer<typeof caseQuery>,
  ) {
    return this.service.list(a, q);
  }
  @Post('cases') @HttpCode(200) open(
    @CurrentActor() a: Actor,
    @Headers('idempotency-key') k: unknown,
    @Body(new SchemaPipe(openCaseBody)) b: z.infer<typeof openCaseBody>,
  ) {
    return this.service.open(a, key(k), b);
  }
  @Get('cases/:id') get(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.get(a, id);
  }
  @Get('cases/:id/events') events(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new SchemaPipe(eventQuery)) q: z.infer<typeof eventQuery>,
  ) {
    return this.service.events(a, id, q.afterVersion, q.limit);
  }
  @Post('cases/:id/reviews') @HttpCode(200) review(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') k: unknown,
    @Body(new SchemaPipe(reviewCaseBody)) b: z.infer<typeof reviewCaseBody>,
  ) {
    return this.service.review(a, key(k), id, b);
  }
  @Post('cases/:id/account-status')
  @Access({ roles: ['ADMIN'] })
  @HttpCode(200)
  accountStatus(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') k: unknown,
    @Body(new SchemaPipe(accountCaseBody)) b: z.infer<typeof accountCaseBody>,
  ) {
    return this.service.accountStatus(a, key(k), id, b);
  }
  @Get('finance/report') @Access({ roles: ['FINANCE', 'ADMIN'] }) report(
    @CurrentActor() a: Actor,
    @Query(new SchemaPipe(reportQuery)) q: z.infer<typeof reportQuery>,
  ) {
    return this.service.report(a, q.limit, q.afterId);
  }
}
