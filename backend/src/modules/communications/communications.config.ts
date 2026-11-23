import { ApiError } from '../../shared/errors/api-error.js';
export class CommunicationsConfig {
  readonly enabled: boolean;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    if (
      env['COMMUNICATIONS_ENABLED'] &&
      !['true', 'false'].includes(env['COMMUNICATIONS_ENABLED'])
    )
      throw new Error('Invalid COMMUNICATIONS_ENABLED');
    this.enabled = env['COMMUNICATIONS_ENABLED'] === 'true';
    if (
      this.enabled &&
      (env['AUTH_ENABLED'] !== 'true' || env['NODE_ENV'] === 'production')
    )
      throw new Error(
        'Communications requires local identity and pending acceptance',
      );
  }
  assertEnabled() {
    if (!this.enabled)
      throw new ApiError(
        'FEATURE_DISABLED',
        503,
        'Communications unavailable',
        60,
      );
  }
}
