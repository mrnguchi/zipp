import { z } from 'zod';
export const bookRideBody = z.strictObject({
  quoteId: z.uuid({ version: 'v4' }),
});
export const rideReasonBody = z.strictObject({
  reason: z.string().trim().min(10).max(300),
});
export const completeRideBody = z.strictObject({
  pin: z.string().regex(/^[0-9]{6}$/),
});
export const rideRatingBody = z.strictObject({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(500).optional(),
});
export const rideDisputeBody = z.strictObject({
  reason: z.string().trim().min(10).max(500),
});
export const rideResolutionBody = z.strictObject({
  resolution: z.enum(['release', 'refund']),
  reason: z.string().trim().min(10).max(500),
});
export const rideListQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid({ version: 'v4' }).optional(),
});
export const rideEventQuery = z.strictObject({
  afterVersion: z.coerce.number().int().min(0).max(2147483646).default(0),
});
export const rideRequestKey = z.uuid({ version: 'v4' });
export const rideWorkCommand = z.strictObject({
  rideId: z.uuid({ version: 'v4' }),
  schemaVersion: z.literal(1),
});
export const rideSchemas = {
  BookRide: bookRideBody,
  RideCancellation: rideReasonBody,
  RideCompletion: completeRideBody,
  RideRating: rideRatingBody,
  RideDispute: rideDisputeBody,
  RideResolution: rideResolutionBody,
};
