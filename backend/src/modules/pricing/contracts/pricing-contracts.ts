import type { QuoteInput } from './pricing.schemas.js';
export interface AreaRecord {
  id: string;
  code: string;
  name: string;
  minimumLatitude: number;
  maximumLatitude: number;
  minimumLongitude: number;
  maximumLongitude: number;
  active: boolean;
  developmentOnly: boolean;
}
export interface PolicyRecord {
  id: string;
  serviceAreaId: string;
  version: string;
  serviceClass: QuoteInput['serviceClass'];
  baseFareXaf: bigint;
  perKilometerXaf: bigint;
  perMinuteXaf: bigint;
  minimumFareXaf: bigint;
  nightMultiplierBps: number;
  commissionBps: number;
  cancellationFeeXaf: bigint;
  active: boolean;
  area: AreaRecord;
}
export interface QuoteRecord {
  id: string;
  ownerUserId: string;
  requestKey: string;
  requestFingerprint: string;
  pricingPolicyId: string;
  serviceClass: QuoteInput['serviceClass'];
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  distanceMeters: number;
  durationSeconds: number;
  routeVersion: string;
  routeFingerprint: string;
  totalAmountXaf: bigint;
  expiresAt: Date;
  consumedByKey: string | null;
  consumedAt: Date | null;
  createdAt: Date;
  policySnapshot: unknown;
}
export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  version: string;
  fingerprint: string;
}
