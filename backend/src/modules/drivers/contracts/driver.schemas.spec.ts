import { describe, expect, it } from '@jest/globals';
import {
  driverLocationBody,
  driverDocumentBody,
  driverVehicleBody,
} from './driver.schemas.js';
import { quoteBody } from '../../pricing/contracts/pricing.schemas.js';
import { DriversConfig } from '../drivers.config.js';
import { PricingConfig } from '../../pricing/pricing.config.js';
describe('driver/upload/pricing input and adapter boundaries', () => {
  it('rejects role/approval injection, oversized files and client fare/distance', () => {
    expect(
      driverVehicleBody.safeParse({
        registrationPlate: 'LT 123',
        manufacturer: 'Fixture',
        model: 'Car',
        color: 'Blue',
        manufactureYear: 2020,
        seatCount: 4,
        status: 'APPROVED',
      }).success,
    ).toBe(false);
    expect(
      driverDocumentBody.safeParse({
        kind: 'LICENSE',
        contentType: 'text/html',
        byteLength: 4000000,
        contentSha256: 'a'.repeat(64),
        documentExpiresAt: '2030-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      driverLocationBody.safeParse({
        schemaVersion: 1,
        locationSessionId: '00000000-0000-4000-8000-000000000001',
        sequence: 1,
        latitude: NaN,
        longitude: 9.7,
        accuracyMeters: 10,
        capturedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
    expect(
      quoteBody.safeParse({
        serviceAreaId: '00000000-0000-4000-8000-000000000004',
        serviceClass: 'EVERYDAY',
        pickup: { latitude: 4.05, longitude: 9.7 },
        destination: { latitude: 4.06, longitude: 9.72 },
        totalAmountXaf: '1',
        distanceMeters: 1,
      }).success,
    ).toBe(false);
  });
  it('keeps local providers disabled and rejects production fixture enablement', () => {
    expect(() => new DriversConfig({}).assertUploads()).toThrow();
    expect(
      () =>
        new DriversConfig({
          NODE_ENV: 'production',
          DRIVER_UPLOADS_ENABLED: 'true',
          DRIVER_DOCUMENT_STORAGE: 'local',
          DRIVER_DOCUMENT_ROOT: '/private',
        }),
    ).toThrow();
    expect(() => new PricingConfig({}).assertEnabled()).toThrow();
    expect(
      () =>
        new PricingConfig({
          NODE_ENV: 'production',
          PRICING_ENABLED: 'true',
          ROUTING_ADAPTER: 'fixture',
        }),
    ).toThrow();
  });
});
