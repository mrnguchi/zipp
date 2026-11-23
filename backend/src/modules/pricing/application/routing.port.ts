import type { QuoteInput } from '../contracts/pricing.schemas.js';
import type { RouteResult } from '../contracts/pricing-contracts.js';
export abstract class RoutingProvider {
  abstract route(input: QuoteInput): Promise<RouteResult>;
}
