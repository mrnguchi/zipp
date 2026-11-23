import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Access, CurrentActor } from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import {
  PricingService,
  quoteView,
  policyView,
} from '../application/pricing.service.js';
import { PricingRepository } from '../application/pricing.repository.js';
import {
  quoteBody,
  pricingPolicyBody,
  serviceAreaBody,
  areaActivationBody,
} from '../contracts/pricing.schemas.js';
@Controller('pricing')
export class PricingController {
  constructor(
    @Inject(PricingService) private readonly pricing: PricingService,
    @Inject(PricingRepository) private readonly repository: PricingRepository,
  ) {}
  @Get('service-areas') async areas() {
    const rows = await this.repository.areas();
    return {
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        minimumLatitude: row.minimumLatitude,
        maximumLatitude: row.maximumLatitude,
        minimumLongitude: row.minimumLongitude,
        maximumLongitude: row.maximumLongitude,
        developmentOnly: row.developmentOnly,
      })),
    };
  }
  @Post('quotes') @HttpCode(201) async quote(
    @CurrentActor() actor: Actor,
    @Headers('idempotency-key') key: unknown,
    @Body(new SchemaPipe(quoteBody)) input: z.infer<typeof quoteBody>,
  ) {
    const requestKey = new SchemaPipe(
      z.uuid({ version: 'v4' }).transform((value) => value.toLowerCase()),
    ).transform(key);
    return quoteView(await this.pricing.create(actor, requestKey, input));
  }
  @Get('quotes/:id') async get(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return quoteView(await this.pricing.get(actor, id));
  }
}
@Controller('admin/pricing')
@Access({ roles: ['ADMIN'] })
export class PricingAdminController {
  constructor(
    @Inject(PricingService) private readonly pricing: PricingService,
  ) {}
  @Post('service-areas') createArea(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(serviceAreaBody))
    input: z.infer<typeof serviceAreaBody>,
  ) {
    return this.pricing.createArea(actor, input);
  }
  @Patch('service-areas/:id') @HttpCode(204) activate(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(areaActivationBody))
    input: z.infer<typeof areaActivationBody>,
  ) {
    return this.pricing.activateArea(actor, id, input.active);
  }
  @Post('policies') async publish(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(pricingPolicyBody))
    input: z.infer<typeof pricingPolicyBody>,
  ) {
    return policyView(await this.pricing.publish(actor, input));
  }
}
