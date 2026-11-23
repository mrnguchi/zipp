import { Injectable } from '@nestjs/common';
import { ApiError } from '../../shared/errors/api-error.js';

@Injectable()
export class IdentityConfig {
  readonly enabled: boolean;
  readonly signingKey: Buffer;
  readonly digestKey: Buffer;
  readonly encryptionKey: Buffer;
  readonly issuer = 'zipp-api';
  readonly audience = 'zipp-mobile';
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const enabled = env['AUTH_ENABLED'] ?? 'false';
    if (!['true', 'false'].includes(enabled))
      throw new Error('Invalid AUTH_ENABLED');
    this.enabled = enabled === 'true';
    const production = env['NODE_ENV'] === 'production';
    if (production && !this.enabled)
      throw new Error('Production identity must be enabled');
    const key = (name: string): Buffer => {
      if (!this.enabled) return Buffer.alloc(32);
      const value = env[name];
      if (!value || !/^[a-f0-9]{64}$/.test(value))
        throw new Error(`Invalid ${name}`);
      return Buffer.from(value, 'hex');
    };
    this.signingKey = key('AUTH_SIGNING_KEY');
    this.digestKey = key('AUTH_DIGEST_KEY');
    this.encryptionKey = key('AUTH_ENCRYPTION_KEY');
    if (
      this.enabled &&
      new Set([
        this.signingKey.toString('hex'),
        this.digestKey.toString('hex'),
        this.encryptionKey.toString('hex'),
      ]).size !== 3
    )
      throw new Error('Identity keys must be separate');
    // A real delivery adapter is deliberately required before production enablement.
    if (
      this.enabled &&
      (production || (env['AUTH_DELIVERY_MODE'] ?? 'local') !== 'local')
    )
      throw new Error('Production code delivery is not configured');
  }
  assertEnabled(): void {
    if (!this.enabled)
      throw new ApiError(
        'IDENTITY_NOT_CONFIGURED',
        503,
        'Identity is not configured',
      );
  }
}
