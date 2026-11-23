import { describe, expect, it } from '@jest/globals';
import { fareForRoute, withinArea } from './fare.js';
import type { PolicyRecord } from '../contracts/pricing-contracts.js';
const policy: PolicyRecord = {
  id: 'fixture',
  serviceAreaId: 'fixture',
  version: 'development-v1',
  serviceClass: 'EVERYDAY',
  baseFareXaf: 500n,
  perKilometerXaf: 200n,
  perMinuteXaf: 30n,
  minimumFareXaf: 1000n,
  nightMultiplierBps: 12500,
  commissionBps: 1000,
  cancellationFeeXaf: 500n,
  active: true,
  area: {
    id: 'fixture',
    code: 'DEV',
    name: 'Fixture',
    minimumLatitude: 3.9,
    maximumLatitude: 4.2,
    minimumLongitude: 9.6,
    maximumLongitude: 9.9,
    active: true,
    developmentOnly: true,
  },
};
describe('exact versioned fare rules', () => {
  it('uses integer route charges and explicit Douala night boundaries', () => {
    expect(
      fareForRoute(policy, 5000, 900, new Date('2026-11-12T12:00:00Z'))
        .totalAmountXaf,
    ).toBe(1950n);
    expect(
      fareForRoute(policy, 5000, 900, new Date('2026-11-12T21:00:00Z'))
        .totalAmountXaf,
    ).toBe(2438n);
    expect(
      fareForRoute(policy, 5000, 900, new Date('2026-11-12T05:00:00Z')).night,
    ).toBe(false);
    expect(
      fareForRoute(policy, 1, 1, new Date('2026-11-12T12:00:00Z'))
        .totalAmountXaf,
    ).toBe(1000n);
  });
  it('rejects non-road-route results beyond supported budgets and outside endpoints', () => {
    for (const meters of [0, -1, NaN, 200001, 1.5])
      expect(() => fareForRoute(policy, meters, 900, new Date())).toThrow();
    expect(withinArea(policy.area, { latitude: 4.05, longitude: 9.7 })).toBe(
      true,
    );
    expect(withinArea(policy.area, { latitude: 0, longitude: 0 })).toBe(false);
  });
});
