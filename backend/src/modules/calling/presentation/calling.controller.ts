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
} from '@nestjs/common';
import type { z } from 'zod';
import { CurrentActor } from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import {
  createCallBody,
  callActionBody,
  callRequestKey,
  sendSignalBody,
  readSignalsBody,
} from '../contracts/call.schemas.js';
import { CallCreateService } from '../application/call-create.service.js';
import { CallLifecycleService } from '../application/call-lifecycle.service.js';
import { CallReadService } from '../application/call-read.service.js';
import { CallSignalingService } from '../application/call-signaling.service.js';
import { CallingConfig } from '../calling.config.js';
const requestKey = (value: unknown) =>
  new SchemaPipe(callRequestKey).transform(value).toLowerCase();
@Controller('calling')
export class CallingController {
  constructor(
    @Inject(CallCreateService) private readonly creates: CallCreateService,
    @Inject(CallLifecycleService)
    private readonly lifecycle: CallLifecycleService,
    @Inject(CallReadService) private readonly reads: CallReadService,
    @Inject(CallSignalingService)
    private readonly signals: CallSignalingService,
    @Inject(CallingConfig) private readonly config: CallingConfig,
  ) {}
  @Get('capabilities') capabilities() {
    this.config.assertEnabled();
    return {
      mode: 'LOCAL_CONTROL',
      audioAvailable: false,
      turnCredentialsAvailable: false,
      nativeIncomingCalls: false,
      signaling: 'REST_EPHEMERAL',
    };
  }
  @Post('calls') @HttpCode(200) create(
    @CurrentActor() a: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(createCallBody)) body: z.infer<typeof createCallBody>,
  ) {
    return this.creates.create(a, requestKey(key), body);
  }
  @Get('calls/active') active(@CurrentActor() a: Actor) {
    return this.reads.active(a);
  }
  @Get('calls/:id') snapshot(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reads.snapshot(a, id);
  }
  @Post('calls/:id/accept') @HttpCode(200) accept(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(callActionBody)) body: z.infer<typeof callActionBody>,
  ) {
    return this.lifecycle.command(a, requestKey(key), id, 'ACCEPT', body);
  }
  @Post('calls/:id/reject') @HttpCode(200) reject(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(callActionBody)) body: z.infer<typeof callActionBody>,
  ) {
    return this.lifecycle.command(a, requestKey(key), id, 'REJECT', body);
  }
  @Post('calls/:id/end') @HttpCode(200) end(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(callActionBody)) body: z.infer<typeof callActionBody>,
  ) {
    return this.lifecycle.command(a, requestKey(key), id, 'END', body);
  }
  @Post('calls/:id/signals') @HttpCode(200) signal(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(sendSignalBody)) body: z.infer<typeof sendSignalBody>,
  ) {
    return this.signals.send(a, id, body);
  }
  @Post('calls/:id/signals/read') @HttpCode(200) signalRead(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(readSignalsBody))
    body: z.infer<typeof readSignalsBody>,
  ) {
    return this.signals.read(a, id, body);
  }
}
