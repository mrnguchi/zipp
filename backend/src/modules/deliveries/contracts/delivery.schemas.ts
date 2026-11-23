import { z } from 'zod';
const phone = z.string().regex(/^[+][1-9][0-9]{7,14}$/),
  name = z.string().trim().min(1).max(100);
export const deliveryPhotoBody = z.strictObject({
  contentType: z.enum(['image/jpeg', 'image/png']),
  byteLength: z.number().int().min(16).max(3145728),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const bookDeliveryBody = z.strictObject({
  quoteId: z.uuid({ version: 'v4' }),
  perspective: z.enum(['SENDING', 'RECEIVING']),
  sender: z.strictObject({ name, phone }),
  recipient: z.strictObject({ name, phone }),
  package: z.strictObject({
    description: z.string().trim().min(3).max(300),
    size: z.enum(['SMALL', 'MEDIUM', 'LARGE']),
    weightGrams: z.number().int().min(1).max(20000),
    photoId: z.uuid({ version: 'v4' }),
  }),
  contactSharingConsent: z.literal(true),
  acceptTerms: z.literal(true),
});
export const deliveryReasonBody = z.strictObject({
  reason: z.string().trim().min(10).max(300),
});
export const deliveryProofBody = z.strictObject({
  code: z.string().regex(/^[0-9]{6}$/),
});
export const deliveryCodeBody = z.strictObject({
  purpose: z.enum(['PICKUP', 'HANDOVER', 'RETURN']),
});
export const deliveryClaimBody = z.strictObject({
  role: z.enum(['SENDER', 'RECIPIENT']),
});
export const deliveryIssueBody = z.strictObject({
  kind: z.enum(['RECIPIENT_UNREACHABLE', 'RETURN_REQUEST', 'DISPUTE']),
  reason: z.string().trim().min(10).max(500),
});
export const deliveryReturnBody = z.strictObject({
  issueId: z.uuid({ version: 'v4' }),
  settlement: z.enum(['RELEASE_HOLD', 'CAPTURE_ORIGINAL']),
  reason: z.string().trim().min(10).max(500),
});
export const deliveryRefundBody = z.strictObject({
  issueId: z.uuid({ version: 'v4' }),
  reason: z.string().trim().min(10).max(500),
});
export const deliveryRatingBody = z.strictObject({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(500).optional(),
});
export const deliveryCapabilityBody = z.strictObject({
  id: z.uuid({ version: 'v4' }),
  secret: z
    .string()
    .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/)
    .meta({
      writeOnly: true,
      description:
        'Client-generated canonical base64url encoding of 32 CSPRNG bytes; never returned.',
    }),
  ttlSeconds: z.number().int().min(600).max(86400).default(28800),
});
export const deliveryPageQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid({ version: 'v4' }).optional(),
});
export const deliveryEventQuery = z.strictObject({
  afterVersion: z.coerce.number().int().min(0).max(2147483646).default(0),
});
export const deliveryRequestKey = z.uuid({ version: 'v4' });
export const deliveryDispatchCommand = z.strictObject({
  deliveryId: z.uuid({ version: 'v4' }),
  schemaVersion: z.literal(1),
});
export const deliverySchemas = {
  DeliveryPhotoIntent: deliveryPhotoBody,
  BookDelivery: bookDeliveryBody,
  DeliveryCancellation: deliveryReasonBody,
  DeliveryProof: deliveryProofBody,
  DeliveryCodeRequest: deliveryCodeBody,
  DeliveryContactClaim: deliveryClaimBody,
  DeliveryIssue: deliveryIssueBody,
  DeliveryReturnAuthorization: deliveryReturnBody,
  DeliveryRefund: deliveryRefundBody,
  DeliveryRating: deliveryRatingBody,
  DeliveryTrackingCapability: deliveryCapabilityBody,
};
export type BookDeliveryInput = z.infer<typeof bookDeliveryBody>;
export type PhotoInput = z.infer<typeof deliveryPhotoBody>;
export type ProofPurpose = z.infer<typeof deliveryCodeBody>['purpose'];
