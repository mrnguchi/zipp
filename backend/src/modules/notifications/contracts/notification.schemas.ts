import { z } from 'zod';
const uuid = z.uuid({ version: 'v4' });
// Canonical 32-byte base64url: last digit has two zero padding bits.
export const installationProof = z
  .string()
  .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/)
  .meta({ writeOnly: true });
export const localPushToken = z
  .string()
  .regex(/^local_[A-Za-z0-9_-]{16,160}$/)
  .meta({ writeOnly: true });
export const registerDeviceBody = z
  .object({
    proof: installationProof,
    expectedGeneration: z.number().int().min(0).max(1000000),
    platform: z.enum(['ANDROID', 'IOS']),
    provider: z.literal('LOCAL'),
    pushToken: localPushToken,
  })
  .strict();
export const revokeDeviceBody = z
  .object({
    proof: installationProof,
    expectedGeneration: z.number().int().min(1).max(1000000),
  })
  .strict();
export const notificationPageQuery = z
  .object({
    cursor: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const notificationReadBody = z.object({}).strict();
export const notificationCommand = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(['MATERIALIZE', 'DISPATCH']),
    id: uuid,
  })
  .strict();
export const deviceViewSchema = z
  .object({
    id: uuid,
    platform: z.enum(['ANDROID', 'IOS']),
    provider: z.literal('LOCAL'),
    generation: z.number().int().min(1).max(1000000),
    expiresAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict();
export const inboxViewSchema = z
  .object({
    id: uuid,
    type: z.literal('ACTIVITY'),
    text: z.literal('You have new activity. Open Zipp to view it.'),
    readAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const notificationSchemas = {
  ReadNotification: notificationReadBody,
  RegisterNotificationDevice: registerDeviceBody,
  RevokeNotificationDevice: revokeDeviceBody,
  NotificationDevice: deviceViewSchema,
  NotificationDevices: z
    .object({ items: z.array(deviceViewSchema).max(5) })
    .strict(),
  NotificationInboxItem: inboxViewSchema,
  NotificationInboxPage: z
    .object({
      items: z.array(inboxViewSchema).max(50),
      nextCursor: uuid.nullable(),
    })
    .strict(),
};
export type DeviceRegistration = z.infer<typeof registerDeviceBody>;
export type DeviceRevocation = z.infer<typeof revokeDeviceBody>;
export type NotificationPage = z.infer<typeof notificationPageQuery>;
