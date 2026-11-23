import { describe, expect, it } from '@jest/globals';
import { assertApproved, freshPresence } from './eligibility.js';
import { assertPlausibleLocation } from './location.js';
import type { DriverRecord } from '../contracts/driver-contracts.js';
const now = new Date('2026-11-12T12:00:00Z');
const driver: DriverRecord = {
  id: 'fixture',
  ownerUserId: 'fixture',
  status: 'APPROVED',
  revision: 1,
  approvedClasses: ['EVERYDAY'],
  vehicle: null,
  submittedAt: now,
  reviewedAt: now,
  createdAt: now,
  updatedAt: now,
  presence: {
    driverApplicationId: 'fixture',
    authSessionId: 'fixture',
    locationSessionId: 'fixture',
    online: true,
    sessionExpiresAt: new Date(now.getTime() + 60000),
    sequence: 1,
    latitude: 4.05,
    longitude: 9.7,
    accuracyMeters: 10,
    capturedAt: now,
    receivedAt: now,
  },
};
describe('driver eligibility and location observation rules', () => {
  it('does not treat approval without documents/vehicle as eligibility', () => {
    expect(() => assertApproved(driver, [], now)).toThrow();
  });
  it('expires freshness and rejects offline epochs', () => {
    expect(freshPresence(driver, now)).toBe(true);
    expect(freshPresence(driver, new Date(now.getTime() + 15001))).toBe(false);
    expect(
      freshPresence(
        { ...driver, presence: { ...driver.presence!, online: false } },
        now,
      ),
    ).toBe(false);
  });
  it('rejects reversed capture time and implausible movement without changing money', () => {
    const previous = driver.presence!;
    const input = {
      schemaVersion: 1 as const,
      locationSessionId: 'fixture',
      sequence: 2,
      latitude: 4.0501,
      longitude: 9.7001,
      accuracyMeters: 10,
      capturedAt: new Date(now.getTime() + 3000).toISOString(),
    };
    expect(() => assertPlausibleLocation(previous, input)).not.toThrow();
    expect(() =>
      assertPlausibleLocation(previous, { ...input, latitude: 8 }),
    ).toThrow();
    expect(() =>
      assertPlausibleLocation(previous, {
        ...input,
        capturedAt: now.toISOString(),
      }),
    ).toThrow();
  });
});
