import { z } from 'zod';
export const driverVehicleBody = z.strictObject({
  registrationPlate: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9 -]{3,24}$/),
  manufacturer: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  color: z.string().trim().min(1).max(40),
  manufactureYear: z.number().int().min(1990).max(2100),
  seatCount: z.number().int().min(1).max(7),
});
export const driverDocumentBody = z.strictObject({
  kind: z.enum(['IDENTITY', 'LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE']),
  contentType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  byteLength: z
    .number()
    .int()
    .min(16)
    .max(3 * 1024 * 1024),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  documentExpiresAt: z.iso.datetime(),
});
export const driverReviewBody = z.strictObject({
  expectedRevision: z.number().int().min(1).max(20),
  decision: z.enum(['approve', 'reject', 'suspend', 'reopen']),
  reason: z.string().trim().min(10).max(300),
  approvedClasses: z
    .array(
      z.enum([
        'EVERYDAY',
        'COMFORT',
        'PREMIUM',
        'DELIVERY_STANDARD',
        'DELIVERY_EXPRESS',
      ]),
    )
    .max(5)
    .default([]),
  documentsReviewed: z.boolean().default(false),
});
export const availabilityBody = z.strictObject({ online: z.boolean() });
export const driverLocationBody = z.strictObject({
  schemaVersion: z.literal(1),
  locationSessionId: z.uuid({ version: 'v4' }),
  sequence: z.number().int().min(1).max(2147483647),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(100),
  capturedAt: z.iso.datetime(),
});
export const driverListQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid({ version: 'v4' }).optional(),
});
export const driverSchemas = {
  DriverVehicle: driverVehicleBody,
  DriverDocumentIntent: driverDocumentBody,
  DriverReview: driverReviewBody,
  DriverAvailability: availabilityBody,
  DriverLocation: driverLocationBody,
};
export type VehicleInput = z.infer<typeof driverVehicleBody>;
export type DocumentInput = z.infer<typeof driverDocumentBody>;
export type ReviewInput = z.infer<typeof driverReviewBody>;
export type LocationInput = z.infer<typeof driverLocationBody>;
