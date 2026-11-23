import { ApiError } from '../../shared/errors/api-error.js';
export class PricingConfig {
  readonly enabled: boolean;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const flag = env['PRICING_ENABLED'] ?? 'false';
    if (!['true', 'false'].includes(flag))
      throw new Error('Invalid PRICING_ENABLED');
    this.enabled = flag === 'true';
    if (
      this.enabled &&
      (env['NODE_ENV'] === 'production' || env['ROUTING_ADAPTER'] !== 'fixture')
    )
      throw new Error(
        'Fixture pricing requires explicit non-production configuration',
      );
  }
  assertEnabled(): void {
    if (!this.enabled)
      throw new ApiError(
        'PRICING_NOT_CONFIGURED',
        503,
        'Pricing is not configured',
      );
  }
}
