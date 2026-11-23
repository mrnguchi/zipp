import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { NodeNotificationCrypto } from './notification-crypto.js';
import { NotificationsConfig } from '../notifications.config.js';
describe('notification secrets and authenticated encryption (written, not run)', () => {
  const crypto = new NodeNotificationCrypto(
    new NotificationsConfig({
      NODE_ENV: 'test',
      AUTH_ENABLED: 'true',
      NOTIFICATIONS_ENABLED: 'true',
      NOTIFICATION_DATA_KEY: '44'.repeat(32),
    }),
  );
  it('binds ciphertext to canonical installation/generation and hides raw endpoint', () => {
    const id = randomUUID(),
      token = 'local_' + randomBytes(24).toString('base64url'),
      sealed = crypto.seal(id, 1, token);
    expect(sealed).not.toContain(token);
    expect(crypto.open(id.toUpperCase(), 1, sealed)).toBe(token);
    expect(() => crypto.open(randomUUID(), 1, sealed)).toThrow();
    expect(() => crypto.open(id, 2, sealed)).toThrow();
    const parts = sealed.split('.');
    const encoded = parts[3];
    if (!encoded) throw new Error('Missing ciphertext');
    parts[3] = (encoded.startsWith('A') ? 'B' : 'A') + encoded.slice(1);
    expect(() => crypto.open(id, 1, parts.join('.'))).toThrow();
  });
  it('uses independent nonce/hash purposes and never accepts malformed digest matches', () => {
    const id = randomUUID(),
      proof = randomBytes(32).toString('base64url'),
      token = 'local_' + 'a'.repeat(32);
    expect(crypto.seal(id, 1, token)).not.toBe(crypto.seal(id, 1, token));
    const digest = crypto.digest(`proof:${id}`, proof);
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(proof);
    expect(
      crypto.matches(digest, crypto.digest(`proof:${randomUUID()}`, proof)),
    ).toBe(false);
    expect(crypto.matches(digest, crypto.digest('LOCAL:token', proof))).toBe(
      false,
    );
    expect(crypto.matches('', digest)).toBe(false);
  });
});
