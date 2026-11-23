import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RoutingProvider } from '../application/routing.port.js';
import type { QuoteInput } from '../contracts/pricing.schemas.js';
import { PricingConfig } from '../pricing.config.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class FixtureRoutingProvider extends RoutingProvider {
  constructor(@Inject(PricingConfig) private readonly config: PricingConfig) {
    super();
  }
  route(input: QuoteInput) {
    this.config.assertEnabled();
    const first = { latitude: 4.05, longitude: 9.7 };
    const last = { latitude: 4.06, longitude: 9.72 };
    const same = (a: typeof first, b: typeof first) =>
      Math.abs(a.latitude - b.latitude) < 0.000001 &&
      Math.abs(a.longitude - b.longitude) < 0.000001;
    if (
      !(
        (same(input.pickup, first) && same(input.destination, last)) ||
        (same(input.pickup, last) && same(input.destination, first))
      )
    )
      throw new BusinessError(
        'ROUTE_NOT_AVAILABLE',
        'Only the documented development fixture route is available',
      );
    return Promise.resolve({
      distanceMeters: 5000,
      durationSeconds: 900,
      version: 'local-fictional-route-v1',
      fingerprint: createHash('sha256')
        .update(
          JSON.stringify([
            input.pickup,
            input.destination,
            'local-fictional-route-v1',
          ]),
        )
        .digest('hex'),
    });
  }
}
