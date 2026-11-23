import { ApiError } from '../../shared/errors/api-error.js';
export class RidesConfig {
  readonly enabled: boolean;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const flag = env['RIDES_ENABLED'] ?? 'false';
    if (!['true', 'false'].includes(flag))
      throw new Error('Invalid RIDES_ENABLED');
    this.enabled = flag === 'true';
    if (this.enabled && env['NODE_ENV'] === 'production')
      throw new Error(
        'Ride providers and runtime acceptance are not configured for production',
      );
  }
  assertEnabled(): void {
    if (!this.enabled)
      throw new ApiError(
        'RIDES_NOT_CONFIGURED',
        503,
        'Ride booking is not configured',
      );
  }
}
