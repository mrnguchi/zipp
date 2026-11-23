import { Injectable } from '@nestjs/common';
import { ApiError } from '../../shared/errors/api-error.js';

@Injectable()
export class FinanceConfig {
  readonly enabled: boolean;
  readonly outcome: string;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const enabled = env['PAYMENTS_ENABLED'] ?? 'false';
    if (!['true', 'false'].includes(enabled))
      throw new Error('Invalid PAYMENTS_ENABLED');
    this.enabled = enabled === 'true';
    this.outcome = env['PAYMENT_LOCAL_OUTCOME'] ?? 'success';
    if (
      this.enabled &&
      (env['NODE_ENV'] === 'production' || env['PAYMENT_ADAPTER'] !== 'local')
    )
      throw new Error(
        'Local payments require explicit non-production configuration',
      );
    if (!['success', 'failure', 'pending', 'ambiguous'].includes(this.outcome))
      throw new Error('Invalid PAYMENT_LOCAL_OUTCOME');
  }
  assertEnabled(): void {
    if (!this.enabled)
      throw new ApiError(
        'PAYMENTS_NOT_CONFIGURED',
        503,
        'Payments are not configured',
      );
  }
}
