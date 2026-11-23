import { resolve } from 'node:path';
import { ApiError } from '../../shared/errors/api-error.js';
export class DeliveriesConfig {
  readonly enabled: boolean;
  readonly mediaEnabled: boolean;
  readonly mediaRoot: string;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const enabled = env['DELIVERIES_ENABLED'] ?? 'false',
      media = env['DELIVERY_MEDIA_ENABLED'] ?? 'false';
    if (
      !['true', 'false'].includes(enabled) ||
      !['true', 'false'].includes(media)
    )
      throw new Error('Invalid delivery flags');
    this.enabled = enabled === 'true';
    this.mediaEnabled = media === 'true';
    this.mediaRoot = resolve(
      env['DELIVERY_MEDIA_ROOT'] ?? './.local/delivery-photos',
    );
    if ((this.enabled || this.mediaEnabled) && env['NODE_ENV'] === 'production')
      throw new Error(
        'Delivery adapters/runtime acceptance are not configured for production',
      );
    if (this.enabled && env['DELIVERY_CODE_ADAPTER'] !== 'local')
      throw new Error('Configure explicit local delivery code adapter');
    if (
      this.mediaEnabled &&
      (env['DELIVERY_MEDIA_ADAPTER'] !== 'local' || !env['DELIVERY_MEDIA_ROOT'])
    )
      throw new Error('Configure private persistent local delivery media');
  }
  assertEnabled() {
    if (!this.enabled)
      throw new ApiError(
        'DELIVERIES_NOT_CONFIGURED',
        503,
        'Delivery booking is not configured',
      );
  }
  assertMedia() {
    if (!this.mediaEnabled)
      throw new ApiError(
        'DELIVERY_MEDIA_NOT_CONFIGURED',
        503,
        'Delivery photo storage is not configured',
      );
  }
}
