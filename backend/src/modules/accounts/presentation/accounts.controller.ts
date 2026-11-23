import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { z } from 'zod';
import { CurrentActor } from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import { AccountsFacade } from '../accounts.facade.js';
import {
  profileBody,
  placeBody,
  placeQuery,
} from '../contracts/account.schemas.js';
import type { PublicPlace } from '../contracts/account-contracts.js';

const kinds = { home: 'HOME', work: 'WORK', other: 'OTHER' } as const;
const publicKinds = { HOME: 'home', WORK: 'work', OTHER: 'other' } as const;
const placeInput = (input: z.infer<typeof placeBody>) => ({
  name: input.name,
  label: input.label,
  kind: kinds[input.kind],
  latitude: input.coordinate.latitude,
  longitude: input.coordinate.longitude,
});
const placeView = (place: PublicPlace) => ({
  id: place.id,
  name: place.name,
  kind: publicKinds[place.kind],
  label: place.label,
  coordinate: { latitude: place.latitude, longitude: place.longitude },
  createdAt: place.createdAt,
});

@Controller('accounts/me')
export class AccountsController {
  constructor(
    @Inject(AccountsFacade) private readonly accounts: AccountsFacade,
  ) {}
  @Get() profile(@CurrentActor() actor: Actor) {
    return this.accounts.profile(actor.userId);
  }
  @Patch() update(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(profileBody)) input: z.infer<typeof profileBody>,
  ) {
    return this.accounts.update(actor.userId, input);
  }
  @Get('saved-places') async places(
    @CurrentActor() actor: Actor,
    @Query(new SchemaPipe(placeQuery)) query: z.infer<typeof placeQuery>,
  ) {
    const rows = await this.accounts.places(
      actor.userId,
      query.limit,
      query.cursor,
    );
    return {
      items: rows.map(placeView),
      nextCursor:
        rows.length === query.limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }
  @Post('saved-places') async create(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(placeBody)) input: z.infer<typeof placeBody>,
  ) {
    return placeView(
      await this.accounts.savePlace(actor.userId, placeInput(input)),
    );
  }
  @Patch('saved-places/:id') async updatePlace(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new SchemaPipe(placeBody)) input: z.infer<typeof placeBody>,
  ) {
    return placeView(
      await this.accounts.savePlace(actor.userId, placeInput(input), id),
    );
  }
  @Delete('saved-places/:id') @HttpCode(204) remove(
    @CurrentActor() actor: Actor,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.accounts.removePlace(actor.userId, id);
  }
}
