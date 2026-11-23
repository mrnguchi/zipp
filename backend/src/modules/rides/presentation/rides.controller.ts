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
import { RideBookingService } from '../application/ride-booking.service.js';
import { RideOfferService } from '../application/ride-offer.service.js';
import { RideLifecycleService } from '../application/ride-lifecycle.service.js';
import { RideReviewService } from '../application/ride-review.service.js';
import { RideReadService, rideView } from '../application/ride-read.service.js';
import {
  bookRideBody,
  rideReasonBody,
  completeRideBody,
  rideRatingBody,
  rideDisputeBody,
  rideResolutionBody,
  rideListQuery,
  rideEventQuery,
  rideRequestKey,
} from '../contracts/ride.schemas.js';
const keyValue = (value: unknown) =>
  new SchemaPipe(rideRequestKey).transform(value).toLowerCase();
@Controller('rides')
export class RidesController {
  constructor(
    @Inject(RideBookingService) private readonly booking: RideBookingService,
    @Inject(RideLifecycleService)
    private readonly lifecycle: RideLifecycleService,
    @Inject(RideReadService) private readonly reads: RideReadService,
    @Inject(RideReviewService) private readonly reviews: RideReviewService,
  ) {}
  @Post() @HttpCode(202) async book(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(bookRideBody)) input: z.infer<typeof bookRideBody>,
  ) {
    return rideView(
      await this.booking.book(actor, keyValue(key), input.quoteId),
    );
  }
  @Get() history(
    @CurrentActor() actor: Actor,
    @Query(new SchemaPipe(rideListQuery)) query: z.infer<typeof rideListQuery>,
  ) {
    return this.reads.history(actor, query.limit, query.cursor);
  }
  @Get('active') active(@CurrentActor() actor: Actor) {
    return this.reads.active(actor);
  }
  @Get(':id') snapshot(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reads.snapshot(actor, id);
  }
  @Get(':id/events') events(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query(new SchemaPipe(rideEventQuery))
    query: z.infer<typeof rideEventQuery>,
  ) {
    return this.reads.events(actor, id, query.afterVersion);
  }
  @Get(':id/tracking') tracking(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reads.tracking(actor, id);
  }
  @Get(':id/receipt') receipt(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reads.receipt(actor, id);
  }
  @Post(':id/cancel') @HttpCode(200) async cancel(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(rideReasonBody)) input: z.infer<typeof rideReasonBody>,
  ) {
    return rideView(
      await this.lifecycle.cancel(actor, keyValue(key), id, input.reason),
    );
  }
  @Post(':id/completion-pin') @HttpCode(200) pin(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.lifecycle.issuePin(actor, id);
  }
  @Post(':id/rating') @HttpCode(200) async rate(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(rideRatingBody)) input: z.infer<typeof rideRatingBody>,
  ) {
    return rideView(
      await this.reviews.rate(
        actor,
        keyValue(key),
        id,
        input.stars,
        input.comment,
      ),
    );
  }
  @Post(':id/disputes') @HttpCode(200) async dispute(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(rideDisputeBody))
    input: z.infer<typeof rideDisputeBody>,
  ) {
    return rideView(
      await this.reviews.dispute(actor, keyValue(key), id, input.reason),
    );
  }
}
@Controller('driver/rides')
@Access({ roles: ['DRIVER'] })
export class DriverRidesController {
  constructor(
    @Inject(RideOfferService) private readonly offers: RideOfferService,
    @Inject(RideLifecycleService)
    private readonly lifecycle: RideLifecycleService,
    @Inject(RideReadService) private readonly reads: RideReadService,
  ) {}
  @Get('offers') offersList(@CurrentActor() actor: Actor) {
    return this.reads.offers(actor);
  }
  @Post('offers/:id/accept') @HttpCode(200) async accept(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return rideView(await this.offers.respond(actor, keyValue(key), id, true));
  }
  @Post('offers/:id/decline') @HttpCode(200) async decline(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    await this.offers.respond(actor, keyValue(key), id, false);
    return { offerId: id, status: 'DECLINED' };
  }
  @Post(':id/arrive') @HttpCode(200) async arrive(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return rideView(
      await this.lifecycle.advance(actor, keyValue(key), id, 'arrive'),
    );
  }
  @Post(':id/start') @HttpCode(200) async start(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
  ) {
    return rideView(
      await this.lifecycle.advance(actor, keyValue(key), id, 'start'),
    );
  }
  @Post(':id/complete') @HttpCode(200) async complete(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(completeRideBody))
    input: z.infer<typeof completeRideBody>,
  ) {
    return rideView(
      await this.lifecycle.complete(actor, keyValue(key), id, input.pin),
    );
  }
}
@Controller('admin/rides')
@Access({ roles: ['ADMIN'] })
export class RideOperationsController {
  constructor(
    @Inject(RideReviewService) private readonly reviews: RideReviewService,
  ) {}
  @Post(':id/resolve-dispute') @HttpCode(200) async resolve(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(rideResolutionBody))
    input: z.infer<typeof rideResolutionBody>,
  ) {
    return rideView(
      await this.reviews.resolve(
        actor,
        keyValue(key),
        id,
        input.resolution,
        input.reason,
      ),
    );
  }
  @Post(':id/retry-dispatch') @HttpCode(200) async retry(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(rideReasonBody)) input: z.infer<typeof rideReasonBody>,
  ) {
    return rideView(
      await this.reviews.retryDispatch(actor, keyValue(key), id, input.reason),
    );
  }
}
