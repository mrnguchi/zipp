import { isIP } from 'node:net';
import { isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { ApiError } from '../../shared/errors/api-error.js';

export class CallRelayConfig {
  readonly enabled: boolean;
  readonly secretFile: string;
  readonly urls: string[];
  readonly #otherKeyDigests: string[];
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const flag = env['CALL_RELAY_CREDENTIALS_ENABLED'] ?? 'false';
    if (!['true', 'false'].includes(flag))
      throw new Error('Invalid relay credential flag');
    this.enabled = flag === 'true';
    this.secretFile = '';
    this.urls = [];
    this.#otherKeyDigests = [];
    if (env['SERVICE_ROLE'] === 'worker') {
      if (this.enabled || env['CALL_RELAY_SECRET_FILE'])
        throw new Error(
          'Relay credentials and secret configuration are API-only',
        );
      return;
    }
    if (!this.enabled) return;
    if (
      env['NODE_ENV'] === 'production' ||
      env['APP_ENV'] === 'production' ||
      env['CALLING_ENABLED'] !== 'true' ||
      env['AUTH_ENABLED'] !== 'true' ||
      env['NOTIFICATIONS_ENABLED'] !== 'true' ||
      (env['CALLING_ADAPTER'] ?? 'local_control') !== 'local_control'
    )
      throw new Error('Relay credentials require explicit local API calling');
    const ip = env['CALL_RELAY_LAN_IP'] ?? '';
    const [a = 0, b = 0, c = 0, d = 0] = ip.split('.').map(Number);
    if (
      isIP(ip) !== 4 ||
      !(
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) ||
      (a === 172 && b === 30 && c === 240 && d < 8)
    )
      throw new Error(
        'Relay listener must be the selected private LAN IPv4 address',
      );
    const file = env['CALL_RELAY_SECRET_FILE'] ?? '';
    if (
      !file ||
      file.length > 1024 ||
      !isAbsolute(file) ||
      /[\r\n\0]/.test(file)
    )
      throw new Error('Relay secret requires an absolute private file path');
    this.secretFile = file;
    this.urls = [
      `turn:${ip}:3478?transport=udp`,
      `turn:${ip}:3478?transport=tcp`,
    ];
    this.#otherKeyDigests = [
      'AUTH_SIGNING_KEY',
      'AUTH_DIGEST_KEY',
      'AUTH_ENCRYPTION_KEY',
      'NOTIFICATION_DATA_KEY',
      'CALL_SIGNAL_KEY',
    ].flatMap((key) => {
      const value = env[key];
      return value ? [createHash('sha256').update(value).digest('hex')] : [];
    });
  }
  assertEnabled() {
    if (!this.enabled)
      throw new ApiError(
        'FEATURE_DISABLED',
        503,
        'Relay credentials unavailable',
        60,
      );
  }
  assertDedicatedKey(value: string) {
    if (
      this.#otherKeyDigests.includes(
        createHash('sha256').update(value).digest('hex'),
      )
    )
      throw new Error('Relay authentication key must be separate');
  }
}
