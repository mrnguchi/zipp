import { describe, expect, it } from '@jest/globals';
import { RealtimeConfig } from './realtime.config.js';
import { liveAuth, liveSnapshot } from './contracts/realtime.schemas.js';
import { randomUUID } from 'node:crypto';
describe('M7 explicit local transport configuration', () => {
  it('does not expose a listener by default', () =>
    expect(new RealtimeConfig({}).enabled).toBe(false));
  it('requires identity and an explicit native/origin policy when enabled', () => {
    expect(() => new RealtimeConfig({ REALTIME_ENABLED: 'true' })).toThrow();
    expect(
      () =>
        new RealtimeConfig({ REALTIME_ENABLED: 'true', AUTH_ENABLED: 'true' }),
    ).toThrow();
  });
  it('rejects production enablement and wildcard/path/query origins', () => {
    expect(
      () =>
        new RealtimeConfig({
          REALTIME_ENABLED: 'true',
          AUTH_ENABLED: 'true',
          REALTIME_ALLOW_NATIVE: 'true',
          NODE_ENV: 'production',
        }),
    ).toThrow();
    for (const origin of [
      '*',
      'https://example.com/path',
      'https://user:pass@example.com',
      'https://example.com?token=secret',
    ])
      expect(
        () => new RealtimeConfig({ REALTIME_ALLOWED_ORIGINS: origin }),
      ).toThrow();
  });
  it('matches exact origins and allows no-Origin native only when opted in', () => {
    const c = new RealtimeConfig({
      REALTIME_ALLOWED_ORIGINS: 'http://localhost:8081',
    });
    expect(c.allows('http://localhost:8081')).toBe(true);
    expect(c.allows('http://localhost:8082')).toBe(false);
    expect(c.allows(undefined)).toBe(false);
    expect(
      new RealtimeConfig({ REALTIME_ALLOW_NATIVE: 'true' }).allows(undefined),
    ).toBe(true);
  });
  it('rejects tracking capabilities, role/room injection and oversized auth', () => {
    const base = {
      schemaVersion: 1,
      accessToken: 'x'.repeat(20) + '.' + 'y'.repeat(20) + '.' + 'z'.repeat(20),
      jobType: 'RIDE',
      jobId: randomUUID(),
    };
    expect(liveAuth.safeParse(base).success).toBe(true);
    expect(
      liveAuth.safeParse({
        ...base,
        accessToken: `${randomUUID()}.${'a'.repeat(43)}`,
      }).success,
    ).toBe(false);
    expect(liveAuth.safeParse({ ...base, room: 'all-drivers' }).success).toBe(
      false,
    );
    expect(liveAuth.safeParse({ ...base, afterVersion: -1 }).success).toBe(
      false,
    );
    expect(
      liveAuth.safeParse({ ...base, accessToken: 'a'.repeat(5000) }).success,
    ).toBe(false);
  });
  it('never accepts secrets or unbounded fields in a server snapshot contract', () => {
    const frame = {
      schemaVersion: 1,
      type: 'job.snapshot',
      jobType: 'RIDE',
      jobId: randomUUID(),
      status: 'ASSIGNED',
      version: 1,
      custody: null,
      terminal: false,
      position: null,
      resyncRequired: true,
      observedAt: new Date().toISOString(),
    };
    expect(liveSnapshot.safeParse(frame).success).toBe(true);
    expect(liveSnapshot.safeParse({ ...frame, pin: '123456' }).success).toBe(
      false,
    );
  });
});
