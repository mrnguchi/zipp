export type RideState =
  | 'SEARCHING'
  | 'ASSIGNED'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_DRIVER';
export interface RideRecord {
  id: string;
  customerUserId: string;
  driverUserId: string | null;
  quoteId: string;
  reservationId: string;
  serviceAreaId: string;
  serviceClass:
    | 'EVERYDAY'
    | 'COMFORT'
    | 'PREMIUM'
    | 'DELIVERY_STANDARD'
    | 'DELIVERY_EXPRESS';
  serviceAreaSnapshot: unknown;
  status: RideState;
  version: number;
  quotedAmountXaf: bigint;
  chargedAmountXaf: bigint;
  commissionBps: number;
  cancellationFeeXaf: bigint;
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  distanceMeters: number;
  durationSeconds: number;
  pricingPolicyVersion: string;
  searchExpiresAt: Date;
  dispatchWave: number;
  radiusMeters: number;
  assignedAt: Date | null;
  arrivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancellationReason: string | null;
  completionPinHash: string | null;
  pinExpiresAt: Date | null;
  pinIssuedAt: Date | null;
  pinIssueCount: number;
  pinIssueWindowEndsAt: Date | null;
  pinFailureCount: number;
  pinFailureWindowEndsAt: Date | null;
  createdAt: Date;
}
export interface OfferRecord {
  id: string;
  rideId: string;
  driverUserId: string;
  wave: number;
  radiusMeters: number;
  status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';
  expiresAt: Date;
  createdAt: Date;
}
export interface RideEventRecord {
  id: string;
  rideId: string;
  aggregateVersion: number;
  schemaVersion: number;
  eventType: string;
  occurredAt: Date;
}
export interface RideRequestRecord {
  requestFingerprint: string;
  rideId: string;
  createdAt: Date;
}
export interface RideDisputeRecord {
  rideId: string;
  openedById: string;
  reason: string;
  resolution: string | null;
  resolutionReason: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}
export type RidePatch = Partial<
  Pick<
    RideRecord,
    | 'status'
    | 'driverUserId'
    | 'chargedAmountXaf'
    | 'dispatchWave'
    | 'radiusMeters'
    | 'assignedAt'
    | 'arrivedAt'
    | 'startedAt'
    | 'completedAt'
    | 'cancellationReason'
    | 'completionPinHash'
    | 'pinExpiresAt'
    | 'pinIssuedAt'
    | 'pinIssueCount'
    | 'pinIssueWindowEndsAt'
    | 'pinFailureCount'
    | 'pinFailureWindowEndsAt'
  >
>;
export interface DispatchClaim {
  rideId: string;
  leaseToken: string;
  attempts: number;
}
