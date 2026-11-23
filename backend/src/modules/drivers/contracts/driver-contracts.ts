export type DriverStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';
export type DriverClass =
  | 'EVERYDAY'
  | 'COMFORT'
  | 'PREMIUM'
  | 'DELIVERY_STANDARD'
  | 'DELIVERY_EXPRESS';
export interface VehicleRecord {
  registrationPlate: string;
  manufacturer: string;
  model: string;
  color: string;
  manufactureYear: number;
  seatCount: number;
}
export interface PresenceRecord {
  driverApplicationId: string;
  authSessionId: string;
  locationSessionId: string;
  online: boolean;
  sessionExpiresAt: Date;
  sequence: number;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  capturedAt: Date | null;
  receivedAt: Date | null;
}
export interface DriverRecord {
  id: string;
  ownerUserId: string;
  status: DriverStatus;
  revision: number;
  approvedClasses: DriverClass[];
  submittedAt: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  vehicle: VehicleRecord | null;
  presence: PresenceRecord | null;
}
export interface DocumentRecord {
  id: string;
  driverApplicationId: string;
  applicationRevision: number;
  kind: 'IDENTITY' | 'LICENSE' | 'VEHICLE_REGISTRATION' | 'INSURANCE';
  status: 'PENDING_UPLOAD' | 'STORED' | 'APPROVED' | 'REJECTED';
  contentType: string;
  byteLength: number;
  contentSha256: string;
  objectKey: string;
  uploadExpiresAt: Date;
  documentExpiresAt: Date;
  createdAt: Date;
}
