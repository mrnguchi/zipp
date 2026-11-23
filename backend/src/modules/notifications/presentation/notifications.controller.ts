import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { z } from 'zod';
import { CurrentActor } from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import { NotificationDevicesService } from '../application/notification-devices.service.js';
import { NotificationInboxService } from '../application/notification-inbox.service.js';
import {
  registerDeviceBody,
  revokeDeviceBody,
  notificationPageQuery,
  notificationReadBody,
} from '../contracts/notification.schemas.js';
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationDevicesService)
    private readonly devices: NotificationDevicesService,
    @Inject(NotificationInboxService)
    private readonly inbox: NotificationInboxService,
  ) {}
  @Put('devices/:id') register(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(registerDeviceBody))
    body: z.infer<typeof registerDeviceBody>,
  ) {
    return this.devices.register(a, id, body);
  }
  @Post('devices/:id/revoke') @HttpCode(200) revoke(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(revokeDeviceBody))
    body: z.infer<typeof revokeDeviceBody>,
  ) {
    return this.devices.revoke(a, id, body);
  }
  @Get('devices') listDevices(@CurrentActor() a: Actor) {
    return this.devices.list(a);
  }
  @Get('inbox') listInbox(
    @CurrentActor() a: Actor,
    @Query(new SchemaPipe(notificationPageQuery))
    query: z.infer<typeof notificationPageQuery>,
  ) {
    return this.inbox.list(a, query);
  }
  @Put('inbox/:id/read') read(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    new SchemaPipe(notificationReadBody).transform(body);
    return this.inbox.read(a, id);
  }
}
