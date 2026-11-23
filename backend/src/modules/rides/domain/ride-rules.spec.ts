import { describe, expect, it } from '@jest/globals';
import {
  areaBounds,
  distanceMeters,
  radiusForWave,
  terminal,
} from './ride-rules.js';
import {
  bookRideBody,
  completeRideBody,
  rideRatingBody,
  rideWorkCommand,
} from '../contracts/ride.schemas.js';
import { RidesConfig } from '../rides.config.js';
describe('ride proximity, state and transport boundaries', () => {
  it('uses proximity independently of road fare and bounds search waves', () => {
    expect(
      distanceMeters(
        { latitude: 4.05, longitude: 9.7 },
        { latitude: 4.05, longitude: 9.7 },
      ),
    ).toBe(0);
    expect(
      distanceMeters(
        { latitude: 4.05, longitude: 9.7 },
        { latitude: 4.06, longitude: 9.72 },
      ),
    ).toBeGreaterThan(500);
    expect([0, 1, 2, 3].map(radiusForWave)).toEqual([2000, 5000, 10000, 10000]);
    expect(terminal('IN_PROGRESS')).toBe(false);
    expect(terminal('COMPLETED')).toBe(true);
  });
  it('rejects malformed persisted areas and client-controlled fare/assignment', () => {
    expect(() => areaBounds({ minimumLatitude: '4' })).toThrow();
    expect(
      bookRideBody.safeParse({
        quoteId: '00000000-0000-4000-8000-000000000001',
        amountXaf: '1',
        driverUserId: 'other',
      }).success,
    ).toBe(false);
    expect(
      completeRideBody.safeParse({ pin: '123456', paymentSucceeded: true })
        .success,
    ).toBe(false);
    expect(rideRatingBody.safeParse({ stars: 6 }).success).toBe(false);
    expect(
      rideWorkCommand.safeParse({ rideId: 'arbitrary', schemaVersion: 2 })
        .success,
    ).toBe(false);
  });
  it('keeps the unfinished local ride provider composition disabled by default', () => {
    expect(() => new RidesConfig({}).assertEnabled()).toThrow();
    expect(
      () => new RidesConfig({ NODE_ENV: 'production', RIDES_ENABLED: 'true' }),
    ).toThrow();
  });
});
