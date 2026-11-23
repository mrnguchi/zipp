export type DeliveryState =
  | 'SEARCHING'
  | 'ASSIGNED'
  | 'AT_PICKUP'
  | 'COLLECTED'
  | 'IN_TRANSIT'
  | 'AT_DESTINATION'
  | 'RETURNING'
  | 'AT_RETURN'
  | 'DELIVERED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'NO_COURIER';
export type CustodyState =
  | 'WITH_SENDER'
  | 'WITH_COURIER'
  | 'WITH_RECIPIENT'
  | 'RETURNED_TO_SENDER';
export interface DeliveryRecord {
  id: string;
  bookerUserId: string;
  senderUserId: string | null;
  recipientUserId: string | null;
  courierUserId: string | null;
  perspective: string;
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  packageDescription: string;
  packageSize: string;
  packageWeightGrams: number;
  packagePhotoId: string;
  contactSharingConsent: boolean;
  termsAcceptedAt: Date;
  quoteId: string;
  reservationId: string;
  serviceAreaId: string;
  serviceAreaSnapshot: unknown;
  serviceClass:
    | 'EVERYDAY'
    | 'COMFORT'
    | 'PREMIUM'
    | 'DELIVERY_STANDARD'
    | 'DELIVERY_EXPRESS';
  quotedAmountXaf: bigint;
  chargedAmountXaf: bigint;
  refundedAmountXaf: bigint;
  commissionBps: number;
  cancellationFeeXaf: bigint;
  pricingPolicyVersion: string;
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  distanceMeters: number;
  durationSeconds: number;
  status: DeliveryState;
  custody: CustodyState;
  version: number;
  dispatchWave: number;
  radiusMeters: number;
  searchExpiresAt: Date;
  assignedAt: Date | null;
  collectedAt: Date | null;
  completedAt: Date | null;
  cancellationReason: string | null;
  returnSettlement: string | null;
  returnAuthorizedById: string | null;
  returnAuthorizationReason: string | null;
  createdAt: Date;
}
export type DeliveryPatch = Partial<
  Pick<
    DeliveryRecord,
    | 'senderUserId'
    | 'recipientUserId'
    | 'courierUserId'
    | 'status'
    | 'custody'
    | 'chargedAmountXaf'
    | 'refundedAmountXaf'
    | 'dispatchWave'
    | 'radiusMeters'
    | 'assignedAt'
    | 'collectedAt'
    | 'completedAt'
    | 'cancellationReason'
    | 'returnSettlement'
    | 'returnAuthorizedById'
    | 'returnAuthorizationReason'
  >
>;
export interface PhotoRecord {
  id: string;
  ownerUserId: string;
  status: string;
  objectKey: string;
  contentType: string;
  byteLength: number;
  contentSha256: string;
  uploadExpiresAt: Date;
  createdAt: Date;
}
export interface DeliveryOfferRecord {
  id: string;
  deliveryId: string;
  courierUserId: string;
  wave: number;
  radiusMeters: number;
  status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';
  expiresAt: Date;
  createdAt: Date;
}
export interface DeliveryProofRecord {
  deliveryId: string;
  purpose: 'PICKUP' | 'HANDOVER' | 'RETURN';
  requestId: string | null;
  codeHash: string | null;
  expiresAt: Date | null;
  consumedAt: Date | null;
  issuedAt: Date | null;
  issueCount: number;
  issueWindowEndsAt: Date | null;
  failureCount: number;
  failureWindowEndsAt: Date | null;
}
export type ProofPatch = Partial<
  Omit<DeliveryProofRecord, 'deliveryId' | 'purpose'>
>;
export interface DeliveryIssueRecord {
  id: string;
  deliveryId: string;
  openedById: string;
  kind: string;
  reason: string;
  resolution: string | null;
  resolutionReason: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}
export interface TrackingRecord {
  requestedTtlSeconds: number;
  id: string;
  deliveryId: string;
  issuedById: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}
export interface DeliveryEventRecord {
  id: string;
  deliveryId: string;
  aggregateVersion: number;
  schemaVersion: number;
  eventType: string;
  occurredAt: Date;
}
export interface DeliveryClaim {
  deliveryId: string;
  leaseToken: string;
  attempts: number;
}
