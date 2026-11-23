import { isAbsolute } from 'node:path';
import { ApiError } from '../../shared/errors/api-error.js';
export class NotificationsConfig {
  readonly enabled: boolean;
  readonly dispatchEnabled: boolean;
  readonly dataKey: Buffer;
  readonly captureRoot: string;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    for (const key of [
      'NOTIFICATIONS_ENABLED',
      'NOTIFICATION_DISPATCH_ENABLED',
    ])
      if (env[key] && !['true', 'false'].includes(env[key]))
        throw new Error(`Invalid ${key}`);
    this.enabled = env['NOTIFICATIONS_ENABLED'] === 'true';
    this.dispatchEnabled = env['NOTIFICATION_DISPATCH_ENABLED'] === 'true';
    this.captureRoot = env['NOTIFICATION_CAPTURE_ROOT'] ?? '';
    const worker = env['SERVICE_ROLE'] === 'worker';
    if (this.dispatchEnabled && (!this.enabled || !worker))
      throw new Error('Notification dispatch requires enabled worker role');
    if (
      this.enabled &&
      (env['NODE_ENV'] === 'production' ||
        (!worker && env['AUTH_ENABLED'] !== 'true') ||
        (env['NOTIFICATION_ADAPTER'] ?? 'capture') !== 'capture')
    )
      throw new Error(
        'Only explicit local capture notifications are supported',
      );
    if (
      this.enabled &&
      !/^[a-f0-9]{64}$/.test(env['NOTIFICATION_DATA_KEY'] ?? '')
    )
      throw new Error('Invalid NOTIFICATION_DATA_KEY');
    this.dataKey = this.enabled
      ? Buffer.from(env['NOTIFICATION_DATA_KEY'] ?? '', 'hex')
      : Buffer.alloc(32);
    if (
      this.enabled &&
      ['AUTH_SIGNING_KEY', 'AUTH_DIGEST_KEY', 'AUTH_ENCRYPTION_KEY'].some(
        (key) => env[key] && env[key] === env['NOTIFICATION_DATA_KEY'],
      )
    )
      throw new Error(
        'Notification data key must be separate from identity keys',
      );
    if (this.dispatchEnabled && !isAbsolute(this.captureRoot))
      throw new Error(
        'Absolute NOTIFICATION_CAPTURE_ROOT required for dispatch',
      );
  }
  assertEnabled() {
    if (!this.enabled)
      throw new ApiError(
        'FEATURE_DISABLED',
        503,
        'Notifications unavailable',
        60,
      );
  }
}
