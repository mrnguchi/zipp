import { z } from 'zod';
export const liveAuth = z.strictObject({
  schemaVersion: z.literal(1),
  accessToken: z
    .string()
    .min(40)
    .max(4096)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    .meta({
      writeOnly: true,
      description:
        'Current private access JWT; auth payload only, never query/URL/log/output.',
    }),
  jobType: z.enum(['RIDE', 'DELIVERY']),
  jobId: z.uuid({ version: 'v4' }),
  afterVersion: z.number().int().min(0).max(2147483646).default(0),
});
export const livePosition = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  receivedAt: z.iso.datetime(),
  stale: z.boolean(),
});
export const liveSnapshot = z
  .strictObject({
    schemaVersion: z.literal(1),
    type: z.literal('job.snapshot'),
    jobType: z.enum(['RIDE', 'DELIVERY']),
    jobId: z.uuid({ version: 'v4' }),
    version: z.number().int().min(1).max(2147483647),
    status: z.enum([
      'SEARCHING',
      'ASSIGNED',
      'ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'NO_DRIVER',
      'AT_PICKUP',
      'COLLECTED',
      'IN_TRANSIT',
      'AT_DESTINATION',
      'RETURNING',
      'AT_RETURN',
      'DELIVERED',
      'RETURNED',
      'NO_COURIER',
    ]),
    custody: z
      .enum([
        'WITH_SENDER',
        'WITH_COURIER',
        'WITH_RECIPIENT',
        'RETURNED_TO_SENDER',
      ])
      .nullable(),
    terminal: z.boolean(),
    position: livePosition.nullable(),
    resyncRequired: z.boolean(),
    observedAt: z.iso.datetime(),
  })
  .refine((s) => !s.terminal || s.position === null, {
    message: 'Terminal snapshots cannot expose location',
  });
export const liveError = z.strictObject({
  schemaVersion: z.literal(1),
  code: z.enum([
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'INVALID_SUBSCRIPTION',
    'REALTIME_UNAVAILABLE',
    'REALTIME_LIMIT',
    'SLOW_CONSUMER',
    'UNSUPPORTED_COMMAND',
  ]),
  retryAfterSeconds: z.number().int().min(0).max(300),
});
export type LiveAuth = z.infer<typeof liveAuth>;
export type LiveSnapshot = z.infer<typeof liveSnapshot>;
