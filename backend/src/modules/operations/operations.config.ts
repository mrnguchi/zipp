import { ApiError } from '../../shared/errors/api-error.js';
export class OperationsConfig {
  readonly enabled: boolean;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    if (
      env['OPERATIONS_ENABLED'] &&
      !['true', 'false'].includes(env['OPERATIONS_ENABLED'])
    )
      throw new Error('Invalid OPERATIONS_ENABLED');
    this.enabled = env['OPERATIONS_ENABLED'] === 'true';
    if (this.enabled && env['AUTH_ENABLED'] !== 'true')
      throw new Error('Operations requires identity');
  }
  assertEnabled() {
    if (!this.enabled)
      throw new ApiError(
        'FEATURE_DISABLED',
        503,
        'Staff operations unavailable',
        60,
      );
  }
}
