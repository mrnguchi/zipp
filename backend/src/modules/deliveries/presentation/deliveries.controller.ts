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
  Put,
  Delete,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Access, CurrentActor } from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import { readPrivateBinaryBody } from '../../../shared/http/binary-upload.js';
import { DeliveryBookingService } from '../application/delivery-booking.service.js';
import {
  DeliveryReadService,
  deliveryView,
} from '../application/delivery-read.service.js';
import { DeliveryLifecycleService } from '../application/delivery-lifecycle.service.js';
import { DeliveryReviewService } from '../application/delivery-review.service.js';
import { DeliveryCodeService } from '../application/delivery-code.service.js';
import { DeliveryPhotoService } from '../application/delivery-photo.service.js';
import { DeliveryTrackingService } from '../application/delivery-tracking.service.js';
import { DeliveryOfferService } from '../application/delivery-offer.service.js';
import {
  bookDeliveryBody,
  deliveryReasonBody,
  deliveryProofBody,
  deliveryCodeBody,
  deliveryClaimBody,
  deliveryIssueBody,
  deliveryReturnBody,
  deliveryRefundBody,
  deliveryRatingBody,
  deliveryCapabilityBody,
  deliveryPhotoBody,
  deliveryPageQuery,
  deliveryEventQuery,
  deliveryRequestKey,
} from '../contracts/delivery.schemas.js';
import { driverLocationBody } from '../../drivers/contracts/driver.schemas.js';
const keyValue = (value: unknown) =>
  new SchemaPipe(deliveryRequestKey).transform(value).toLowerCase();
@Controller('deliveries')
export class DeliveriesController {
  constructor(
    @Inject(DeliveryBookingService)
    private readonly booking: DeliveryBookingService,
    @Inject(DeliveryReadService) private readonly reads: DeliveryReadService,
    @Inject(DeliveryLifecycleService)
    private readonly lifecycle: DeliveryLifecycleService,
    @Inject(DeliveryReviewService)
    private readonly reviews: DeliveryReviewService,
    @Inject(DeliveryCodeService) private readonly codes: DeliveryCodeService,
    @Inject(DeliveryTrackingService)
    private readonly tracking: DeliveryTrackingService,
  ) {}
  @Post() @HttpCode(202) async book(
    @CurrentActor() a: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(bookDeliveryBody))
    input: z.infer<typeof bookDeliveryBody>,
  ) {
    return deliveryView(
      await this.booking.book(a, keyValue(key), input),
      a.userId,
    );
  }
  @Get() history(
    @CurrentActor() a: Actor,
    @Query(new SchemaPipe(deliveryPageQuery))
    q: z.infer<typeof deliveryPageQuery>,
  ) {
    return this.reads.history(a, q.limit, q.cursor);
  }
  @Get('active') active(@CurrentActor() a: Actor) {
    return this.reads.active(a);
  }
  @Get(':id') snapshot(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reads.snapshot(a, id);
  }
  @Get(':id/tracking') track(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reads.tracking(a, id);
  }
  @Get(':id/receipt') receipt(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reads.receipt(a, id);
  }
  @Get(':id/issues') issues(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reads.issues(a, id);
  }
  @Get(':id/events') events(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new SchemaPipe(deliveryEventQuery))
    q: z.infer<typeof deliveryEventQuery>,
  ) {
    return this.reads.events(a, id, q.afterVersion);
  }
  @Post(':id/cancel') @HttpCode(200) async cancel(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryReasonBody))
    input: z.infer<typeof deliveryReasonBody>,
  ) {
    return deliveryView(
      await this.lifecycle.cancel(a, keyValue(key), id, input.reason),
      a.userId,
    );
  }
  @Post(':id/contact-codes') @HttpCode(200) code(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(deliveryCodeBody))
    input: z.infer<typeof deliveryCodeBody>,
  ) {
    return this.codes.issue(a, id, input.purpose);
  }
  @Post(':id/claim-contact') @HttpCode(200) async claim(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryClaimBody))
    input: z.infer<typeof deliveryClaimBody>,
  ) {
    return deliveryView(
      await this.reviews.claim(a, keyValue(key), id, input.role),
      a.userId,
    );
  }
  @Post(':id/issues') @HttpCode(200) async issue(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryIssueBody))
    input: z.infer<typeof deliveryIssueBody>,
  ) {
    return deliveryView(
      await this.reviews.issue(a, keyValue(key), id, input.kind, input.reason),
      a.userId,
    );
  }
  @Post(':id/rating') @HttpCode(200) async rate(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryRatingBody))
    input: z.infer<typeof deliveryRatingBody>,
  ) {
    return deliveryView(
      await this.reviews.rate(a, keyValue(key), id, input.stars, input.comment),
      a.userId,
    );
  }
  @Post(':id/tracking-capabilities') @HttpCode(201) share(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(deliveryCapabilityBody))
    input: z.infer<typeof deliveryCapabilityBody>,
  ) {
    return this.tracking.issue(a, id, input);
  }
  @Get(':id/tracking-capabilities') capabilities(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.tracking.list(a, id);
  }
  @Delete(':id/tracking-capabilities/:capId') revoke(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('capId', new ParseUUIDPipe({ version: '4' })) capId: string,
  ) {
    return this.tracking.revoke(a, id, capId);
  }
}
@Controller('courier/deliveries')
export class CourierDeliveriesController {
  constructor(
    @Inject(DeliveryOfferService) private readonly offers: DeliveryOfferService,
    @Inject(DeliveryLifecycleService)
    private readonly lifecycle: DeliveryLifecycleService,
  ) {}
  @Get('offers') @Access({ roles: ['DRIVER'] }) list(@CurrentActor() a: Actor) {
    return this.offers.list(a);
  }
  @Post('offers/:id/accept') @HttpCode(200) accept(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.offers.respond(a, keyValue(key), id, true);
  }
  @Post('offers/:id/decline') @HttpCode(200) decline(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return this.offers.respond(a, keyValue(key), id, false);
  }
  @Post(':id/arrive-pickup')
  @HttpCode(200)
  @Access({ roles: ['DRIVER'] })
  async arrive_pickup(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return deliveryView(
      await this.lifecycle.advance(a, keyValue(key), id, 'ARRIVE_PICKUP'),
      a.userId,
    );
  }
  @Post(':id/collect')
  @HttpCode(200)
  @Access({ roles: ['DRIVER'] })
  async collect(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryProofBody))
    input: z.infer<typeof deliveryProofBody>,
  ) {
    return deliveryView(
      await this.lifecycle.advance(a, keyValue(key), id, 'COLLECT', input.code),
      a.userId,
    );
  }
  @Post(':id/transit') @HttpCode(200) async transit(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return deliveryView(
      await this.lifecycle.advance(a, keyValue(key), id, 'TRANSIT'),
      a.userId,
    );
  }
  @Post(':id/arrive-destination') @HttpCode(200) async arrive_destination(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return deliveryView(
      await this.lifecycle.advance(a, keyValue(key), id, 'ARRIVE_DESTINATION'),
      a.userId,
    );
  }
  @Post(':id/deliver') @HttpCode(200) async deliver(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryProofBody))
    input: z.infer<typeof deliveryProofBody>,
  ) {
    return deliveryView(
      await this.lifecycle.advance(a, keyValue(key), id, 'DELIVER', input.code),
      a.userId,
    );
  }
  @Post(':id/arrive-return') @HttpCode(200) async arrive_return(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return deliveryView(
      await this.lifecycle.advance(a, keyValue(key), id, 'ARRIVE_RETURN'),
      a.userId,
    );
  }
  @Post(':id/confirm-return') @HttpCode(200) async return(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryProofBody))
    input: z.infer<typeof deliveryProofBody>,
  ) {
    return deliveryView(
      await this.lifecycle.advance(a, keyValue(key), id, 'RETURN', input.code),
      a.userId,
    );
  }
  @Post(':id/custody-location-session') @HttpCode(200) epoch(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.lifecycle.custodyLocation(a, id);
  }
  @Post(':id/custody-location') @HttpCode(200) location(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(driverLocationBody))
    input: z.infer<typeof driverLocationBody>,
  ) {
    return this.lifecycle.custodyLocation(a, id, input);
  }
}
@Controller('admin/deliveries')
@Access({ roles: ['ADMIN'] })
export class DeliveryOperationsController {
  constructor(
    @Inject(DeliveryReviewService)
    private readonly reviews: DeliveryReviewService,
  ) {}
  @Get(':id') inspect(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reviews.inspect(a, id);
  }
  @Post(':id/retry-dispatch') @HttpCode(200) async retry(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryReasonBody))
    input: z.infer<typeof deliveryReasonBody>,
  ) {
    const d = await this.reviews.retryDispatch(
      a,
      keyValue(key),
      id,
      input.reason,
    );
    return { id: d.id, status: d.status, version: d.version };
  }
  @Post(':id/authorize-return') @HttpCode(200) async authorize(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryReturnBody))
    input: z.infer<typeof deliveryReturnBody>,
  ) {
    const d = await this.reviews.resolve(
      a,
      keyValue(key),
      id,
      input.issueId,
      input.reason,
      input.settlement,
    );
    return { id: d.id, status: d.status, version: d.version };
  }
  @Post(':id/refund') @HttpCode(200) async refund(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(deliveryRefundBody))
    input: z.infer<typeof deliveryRefundBody>,
  ) {
    const d = await this.reviews.resolve(
      a,
      keyValue(key),
      id,
      input.issueId,
      input.reason,
    );
    return { id: d.id, status: d.status, version: d.version };
  }
}
@Controller('delivery-photos')
export class DeliveryPhotosController {
  constructor(
    @Inject(DeliveryPhotoService) private readonly photos: DeliveryPhotoService,
  ) {}
  @Post() intent(
    @CurrentActor() a: Actor,
    @Body(new SchemaPipe(deliveryPhotoBody))
    input: z.infer<typeof deliveryPhotoBody>,
  ) {
    return this.photos.intent(a, input);
  }
  @Put(':id/content') @HttpCode(200) async upload(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: Request,
  ) {
    const intent = await this.photos.uploadIntent(a, id);
    return this.photos.upload(
      a,
      id,
      await readPrivateBinaryBody(req, intent.byteLength),
    );
  }
  @Get(':id/content') async download(
    @CurrentActor() a: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() res: Response,
  ) {
    const file = await this.photos.download(a, id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="package-${id}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(file.bytes));
  }
}
@Controller('delivery-tracking')
@Access({ public: true })
export class PublicDeliveryTrackingController {
  constructor(
    @Inject(DeliveryTrackingService)
    private readonly tracking: DeliveryTrackingService,
  ) {}
  @Get() view(@Headers('authorization') auth: unknown) {
    return this.tracking.publicView(auth);
  }
}
