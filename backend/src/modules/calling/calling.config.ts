import { ApiError } from '../../shared/errors/api-error.js';
export class CallingConfig {
  readonly enabled: boolean;
  readonly reaperEnabled: boolean;
  readonly signalKey: Buffer;
  readonly worker: boolean;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    for (const key of ['CALLING_ENABLED', 'CALLING_REAPER_ENABLED'])
      if (env[key] && !['true', 'false'].includes(env[key]))
        throw new Error(`Invalid ${key}`);
    this.enabled = env['CALLING_ENABLED'] === 'true';
    this.reaperEnabled = env['CALLING_REAPER_ENABLED'] === 'true';
    this.worker = env['SERVICE_ROLE'] === 'worker';
    if (this.reaperEnabled && (!this.worker || !this.enabled))
      throw new Error('Call reaper requires enabled worker role');
    if (
      this.enabled &&
      (env['NODE_ENV'] === 'production' ||
        env['NOTIFICATIONS_ENABLED'] !== 'true' ||
        (!this.worker && env['AUTH_ENABLED'] !== 'true') ||
        (env['CALLING_ADAPTER'] ?? 'local_control') !== 'local_control')
    )
      throw new Error('Only explicit local control calling is supported');
    const api = this.enabled && !this.worker;
    if (api && !/^[a-f0-9]{64}$/.test(env['CALL_SIGNAL_KEY'] ?? ''))
      throw new Error('Invalid CALL_SIGNAL_KEY');
    if (
      api &&
      [
        'AUTH_SIGNING_KEY',
        'AUTH_DIGEST_KEY',
        'AUTH_ENCRYPTION_KEY',
        'NOTIFICATION_DATA_KEY',
      ].some((key) => env[key] && env[key] === env['CALL_SIGNAL_KEY'])
    )
      throw new Error('Call signal key must be separate');
    this.signalKey = api
      ? Buffer.from(env['CALL_SIGNAL_KEY'] ?? '', 'hex')
      : Buffer.alloc(32);
  }
  assertEnabled() {
    if (!this.enabled)
      throw new ApiError('FEATURE_DISABLED', 503, 'Calling unavailable', 60);
  }
  assertSignaling() {
    this.assertEnabled();
    if (this.worker) throw new Error('Signaling is API-only');
  }
}
