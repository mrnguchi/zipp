import { describe, expect, it } from '@jest/globals';
import { hasRecentMfa } from './actor.js';
import type { Actor } from './actor.js';

describe('recent strong MFA policy', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const actor: Actor = {
    userId: 'user',
    sessionId: 'session',
    roles: ['CUSTOMER'],
    mfaEnabled: true,
    mfaVerifiedAt: now,
  };
  it('requires both enrollment and a recent server-side verification', () => {
    expect(hasRecentMfa(actor, now)).toBe(true);
    expect(hasRecentMfa({ ...actor, mfaEnabled: false }, now)).toBe(false);
    expect(hasRecentMfa({ ...actor, mfaVerifiedAt: null }, now)).toBe(false);
  });
  it('rejects stale and future authentication timestamps', () => {
    expect(
      hasRecentMfa(
        { ...actor, mfaVerifiedAt: new Date(now.getTime() - 300_001) },
        now,
      ),
    ).toBe(false);
    expect(
      hasRecentMfa(
        { ...actor, mfaVerifiedAt: new Date(now.getTime() + 1) },
        now,
      ),
    ).toBe(false);
  });
});
