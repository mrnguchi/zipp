import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { SignJWT } from 'jose';
import { generate } from 'otplib';
import { NodeIdentityCrypto } from './identity-crypto.js';
import { IdentityConfig } from '../identity.config.js';
import {
  identityTestConfig,
  identityTestEnvironment,
} from '../../../../tests/helpers/identity-config.js';

describe('identity credential isolation (sources only until authorized)', () => {
  it('uses salted hashes, verifies correctly and does not authenticate an unknown user', async () => {
    const crypto = new NodeIdentityCrypto(identityTestConfig());
    const password = 'a sufficiently long passphrase';
    const first = await crypto.hashPassword(password);
    const second = await crypto.hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await crypto.verifyPassword(password, first)).toBe(true);
    expect(await crypto.verifyPassword('a wrong passphrase', first)).toBe(
      false,
    );
    expect(await crypto.verifyPassword(password, null)).toBe(false);
  });
  it('validates access-token claims and rejects a correctly signed wrong-purpose token', async () => {
    const config = identityTestConfig();
    const crypto = new NodeIdentityCrypto(config);
    const userId = randomUUID();
    const sessionId = randomUUID();
    expect(await crypto.verify(await crypto.sign(userId, sessionId))).toEqual({
      userId,
      sessionId,
    });
    for (const [purpose, audience, issuer] of [
      ['reset', config.audience, config.issuer],
      ['access', 'other-client', config.issuer],
      ['access', config.audience, 'other-issuer'],
    ]) {
      const token = await new SignJWT({ purpose, sid: sessionId })
        .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
        .setSubject(userId)
        .setAudience(audience ?? '')
        .setIssuer(issuer ?? '')
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(config.signingKey);
      await expect(crypto.verify(token)).rejects.toThrow();
    }
  });
  it('binds encrypted TOTP secrets to their user and rejects accepted time-step replay', async () => {
    const crypto = new NodeIdentityCrypto(identityTestConfig());
    const userId = randomUUID();
    const enrollment = crypto.createTotp(userId, '+237612345678');
    const secret = new URL(enrollment.uri).searchParams.get('secret');
    if (!secret) throw new Error('Enrollment did not provide a secret');
    const code = await generate({ secret });
    const step = await crypto.verifyTotp(
      userId,
      enrollment.encrypted,
      code,
      -1,
    );
    expect(step).not.toBeNull();
    if (step === null) throw new Error('TOTP verification failed');
    expect(
      await crypto.verifyTotp(userId, enrollment.encrypted, code, step),
    ).toBeNull();
    expect(
      await crypto.verifyTotp(randomUUID(), enrollment.encrypted, code, -1),
    ).toBeNull();
  });
  it('does not confuse OTP purposes or configured key responsibilities', () => {
    const crypto = new NodeIdentityCrypto(identityTestConfig());
    expect(crypto.digest('otp:ENROLL:example', '123456')).not.toBe(
      crypto.digest('otp:PASSWORD_RESET:example', '123456'),
    );
    expect(
      () =>
        new IdentityConfig({
          ...identityTestEnvironment,
          AUTH_DIGEST_KEY: identityTestEnvironment.AUTH_SIGNING_KEY,
        }),
    ).toThrow('separate');
  });
  it('fails closed for disabled identity and forbids production local delivery', async () => {
    const crypto = new NodeIdentityCrypto(
      new IdentityConfig({ NODE_ENV: 'test', AUTH_ENABLED: 'false' }),
    );
    await expect(crypto.sign(randomUUID(), randomUUID())).rejects.toThrow();
    expect(
      () =>
        new IdentityConfig({
          ...identityTestEnvironment,
          NODE_ENV: 'production',
        }),
    ).toThrow('delivery');
    expect(
      () =>
        new IdentityConfig({ NODE_ENV: 'production', AUTH_ENABLED: 'false' }),
    ).toThrow('enabled');
  });
});
