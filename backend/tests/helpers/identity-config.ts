import { IdentityConfig } from '../../src/modules/identity/identity.config.js';

// Public, deterministic fixtures only; setup-local-auth generates real local keys.
export const identityTestEnvironment = {
  NODE_ENV: 'test',
  AUTH_ENABLED: 'true',
  AUTH_DELIVERY_MODE: 'local',
  AUTH_SIGNING_KEY: '11'.repeat(32),
  AUTH_DIGEST_KEY: '22'.repeat(32),
  AUTH_ENCRYPTION_KEY: '33'.repeat(32),
};
export const identityTestConfig = () =>
  new IdentityConfig(identityTestEnvironment);
