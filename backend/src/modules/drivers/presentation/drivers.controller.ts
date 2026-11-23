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
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Access, CurrentActor } from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import { DriverService } from '../application/driver.service.js';
import { DriverDocumentService } from '../application/driver-document.service.js';
import { DriverRepository } from '../application/driver.repository.js';
import {
  driverVehicleBody,
  driverDocumentBody,
  driverReviewBody,
  availabilityBody,
  driverLocationBody,
  driverListQuery,
} from '../contracts/driver.schemas.js';
import { readPrivateBinaryBody } from '../../../shared/http/binary-upload.js';
import { BusinessError } from '../../../shared/errors/business-error.js';

@Controller('drivers/me')
export class DriversController {
  constructor(
    @Inject(DriverService) private readonly drivers: DriverService,
    @Inject(DriverDocumentService)
    private readonly documents: DriverDocumentService,
    @Inject(DriverRepository) private readonly repository: DriverRepository,
  ) {}
  @Get() async me(@CurrentActor() actor: Actor) {
    return this.drivers.view(await this.repository.findOwner(actor.userId));
  }
  @Put('vehicle') async vehicle(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(driverVehicleBody))
    input: z.infer<typeof driverVehicleBody>,
  ) {
    return this.drivers.view(await this.drivers.vehicle(actor, input));
  }
  @Post('submit') @HttpCode(200) async submit(@CurrentActor() actor: Actor) {
    return this.drivers.view(await this.drivers.submit(actor));
  }
  @Post('documents') intent(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(driverDocumentBody))
    input: z.infer<typeof driverDocumentBody>,
  ) {
    return this.documents.intent(actor, input);
  }
  @Put('documents/:id/content') @HttpCode(204) async upload(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: Request,
  ) {
    const target = await this.documents.uploadTarget(actor, id);
    await this.documents.upload(
      actor,
      id,
      await readPrivateBinaryBody(request, target.byteLength),
    );
  }
  @Put('availability') @HttpCode(200) async availability(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(availabilityBody))
    input: z.infer<typeof availabilityBody>,
  ) {
    const p = await this.drivers.availability(actor, input.online);
    return {
      online: p.online,
      locationSessionId: p.locationSessionId,
      sessionExpiresAt: p.sessionExpiresAt,
      sequence: p.sequence,
    };
  }
  @Post('location') @HttpCode(200) async location(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(driverLocationBody))
    input: z.infer<typeof driverLocationBody>,
  ) {
    const p = await this.drivers.location(actor, input);
    return {
      acceptedSequence: p.sequence,
      receivedAt: p.receivedAt,
      freshUntil: new Date((p.receivedAt?.getTime() ?? 0) + 15000),
    };
  }
  @Get('eligibility') eligibility(@CurrentActor() actor: Actor) {
    return this.drivers.eligibility(actor);
  }
}
@Controller('driver-documents')
export class DriverDownloadsController {
  constructor(
    @Inject(DriverDocumentService)
    private readonly documents: DriverDocumentService,
  ) {}
  @Get(':id/content') async download(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Res() response: Response,
  ) {
    const file = await this.documents.download(actor, id);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="document-${id}"`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.send(Buffer.from(file.bytes));
  }
}
@Controller('admin/drivers')
@Access({ roles: ['ADMIN'] })
export class DriverReviewController {
  constructor(
    @Inject(DriverService) private readonly drivers: DriverService,
    @Inject(DriverRepository) private readonly repository: DriverRepository,
  ) {}
  @Get() async list(
    @Query(new SchemaPipe(driverListQuery))
    query: z.infer<typeof driverListQuery>,
  ) {
    const rows = await this.repository.list(query.limit, query.cursor);
    return {
      // Keep the list bounded to summaries; documents/reasons load on the detail route.
      items: rows.map((row) => ({
        id: row.id,
        ownerUserId: row.ownerUserId,
        status: row.status,
        revision: row.revision,
        approvedClasses: row.approvedClasses,
        submittedAt: row.submittedAt,
        reviewedAt: row.reviewedAt,
      })),
      nextCursor:
        rows.length === query.limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }
  @Get(':id') async get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const driver = await this.repository.find(id);
    if (!driver)
      throw new BusinessError('NOT_FOUND', 'Driver application not found');
    return this.drivers.view(driver);
  }
  @Post(':id/review') @HttpCode(200) async review(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(driverReviewBody))
    input: z.infer<typeof driverReviewBody>,
  ) {
    return this.drivers.view(await this.drivers.review(actor, id, input));
  }
}
