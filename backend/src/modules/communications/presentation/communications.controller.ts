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
  Put,
} from '@nestjs/common';
import type { z } from 'zod';
import { Access, CurrentActor } from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import { CommunicationCommandService } from '../application/communication-command.service.js';
import { CommunicationReadService } from '../application/communication-read.service.js';
import {
  jobContextBody,
  ticketBody,
  sendMessageBody,
  readCursorBody,
  ticketStatusBody,
  messagePageQuery,
  ticketPageQuery,
  communicationRequestKey,
} from '../contracts/communication.schemas.js';
const idPipe = () => new ParseUUIDPipe({ version: '4' });
const requestKey = (value: unknown) =>
  new SchemaPipe(communicationRequestKey).transform(value).toLowerCase();
@Controller('communications')
export class CommunicationsController {
  constructor(
    @Inject(CommunicationCommandService)
    private readonly commands: CommunicationCommandService,
    @Inject(CommunicationReadService)
    private readonly reads: CommunicationReadService,
  ) {}
  @Post('job-conversations') @HttpCode(200) open(
    @CurrentActor() a: Actor,
    @Body(new SchemaPipe(jobContextBody)) body: z.infer<typeof jobContextBody>,
  ) {
    return this.commands.openJob(a, body);
  }
  @Post('tickets') @HttpCode(200) create(
    @CurrentActor() a: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(ticketBody)) body: z.infer<typeof ticketBody>,
  ) {
    return this.commands.createTicket(a, requestKey(key), body);
  }
  @Get('tickets') tickets(
    @CurrentActor() a: Actor,
    @Query(new SchemaPipe(ticketPageQuery))
    query: z.infer<typeof ticketPageQuery>,
  ) {
    return this.reads.tickets(a, query);
  }
  @Get('support/tickets') @Access({ roles: ['SUPPORT', 'ADMIN'] }) queue(
    @CurrentActor() a: Actor,
    @Query(new SchemaPipe(ticketPageQuery))
    query: z.infer<typeof ticketPageQuery>,
  ) {
    return this.reads.tickets(a, query, true);
  }
  @Get('threads/:id') snapshot(
    @CurrentActor() a: Actor,
    @Param('id', idPipe()) id: string,
  ) {
    return this.reads.snapshot(a, id);
  }
  @Get('threads/:id/messages') history(
    @CurrentActor() a: Actor,
    @Param('id', idPipe()) id: string,
    @Query(new SchemaPipe(messagePageQuery))
    query: z.infer<typeof messagePageQuery>,
  ) {
    return this.reads.history(a, id, query.after, query.limit);
  }
  @Post('threads/:id/messages') @HttpCode(200) send(
    @CurrentActor() a: Actor,
    @Param('id', idPipe()) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(sendMessageBody))
    body: z.infer<typeof sendMessageBody>,
  ) {
    return this.commands.send(a, requestKey(key), id, body.body);
  }
  @Put('threads/:id/read-cursor') acknowledge(
    @CurrentActor() a: Actor,
    @Param('id', idPipe()) id: string,
    @Body(new SchemaPipe(readCursorBody)) body: z.infer<typeof readCursorBody>,
  ) {
    return this.reads.acknowledge(a, id, body.sequence);
  }
  @Post('tickets/:id/status') @HttpCode(200) status(
    @CurrentActor() a: Actor,
    @Param('id', idPipe()) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(ticketStatusBody))
    body: z.infer<typeof ticketStatusBody>,
  ) {
    return this.commands.changeStatus(a, requestKey(key), id, body);
  }
}
