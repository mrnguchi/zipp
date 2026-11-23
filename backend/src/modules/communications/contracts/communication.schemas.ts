import { z } from 'zod';
const uuid = z.uuid({ version: 'v4' });
// Plain text only: preserve line breaks, reject invisible controls and bound UTF-8 bytes too.
export const messageText = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .regex(/^(?:[^\p{Cc}]|[\t\n\r])*$/u);
export const jobContextBody = z
  .object({ jobType: z.enum(['RIDE', 'DELIVERY']), jobId: uuid })
  .strict();
export const ticketBody = z
  .object({
    subject: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .regex(/^[^\p{Cc}]*$/u),
    category: z.enum([
      'ACCOUNT',
      'RIDE',
      'DELIVERY',
      'PAYMENT',
      'SAFETY',
      'OTHER',
    ]),
    body: messageText,
    job: jobContextBody.optional(),
  })
  .strict();
export const sendMessageBody = z.object({ body: messageText }).strict();
export const readCursorBody = z
  .object({ sequence: z.number().int().min(0).max(2000) })
  .strict();
export const ticketStatusBody = z
  .object({
    status: z.enum(['OPEN', 'RESOLVED']),
    expectedVersion: z.number().int().min(1).max(1000000),
    reason: z.enum([
      'CUSTOMER_REQUEST',
      'ANSWERED',
      'DUPLICATE',
      'FOLLOW_UP',
      'OTHER',
    ]),
  })
  .strict();
export const messagePageQuery = z
  .object({
    after: z.coerce.number().int().min(0).max(2000).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .strict();
export const ticketPageQuery = z
  .object({
    cursor: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(30).default(20),
    status: z.enum(['OPEN', 'RESOLVED']).optional(),
  })
  .strict();
export const communicationRequestKey = uuid;
export const communicationThread = z
  .object({
    id: uuid,
    kind: z.enum(['JOB', 'SUPPORT']),
    job: jobContextBody.nullable(),
    subject: z.string().nullable(),
    category: z.string().nullable(),
    status: z.enum(['OPEN', 'RESOLVED']),
    version: z.number().int().min(1).max(1000000),
    lastSequence: z.number().int().min(0).max(2000),
    writable: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const communicationReceipt = z
  .object({
    threadId: uuid,
    messageId: uuid.nullable(),
    sequence: z.number().int().min(1).max(2000).nullable(),
    version: z.number().int().min(1).max(1000000),
  })
  .strict();
export const communicationEvent = z
  .object({
    id: uuid,
    threadId: uuid,
    schemaVersion: z.literal(1),
    aggregateVersion: z.number().int().min(1).max(1000000),
    type: z.enum([
      'conversation.opened',
      'ticket.opened',
      'message.sent',
      'ticket.reopened',
      'ticket.resolved',
    ]),
    actorUserId: uuid,
    messageSequence: z.number().int().min(1).max(2000).nullable(),
    reason: z
      .enum(['CUSTOMER_REQUEST', 'ANSWERED', 'DUPLICATE', 'FOLLOW_UP', 'OTHER'])
      .nullable(),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export const communicationSchemas = {
  JobConversationInput: jobContextBody,
  SupportTicketInput: ticketBody,
  SendMessageInput: sendMessageBody,
  ReadCursorInput: readCursorBody,
  TicketStatusInput: ticketStatusBody,
  CommunicationThread: communicationThread,
  CommunicationSnapshot: communicationThread.extend({
    readSequence: z.number().int().min(0).max(2000),
  }),
  CommunicationReceipt: communicationReceipt,
  CommunicationReadCursor: z
    .object({ readSequence: z.number().int().min(0).max(2000) })
    .strict(),
  CommunicationHistory: z
    .object({
      thread: communicationThread,
      items: z
        .array(
          z
            .object({
              id: uuid,
              sequence: z.number().int().min(1).max(2000),
              authorUserId: uuid,
              body: messageText,
              createdAt: z.iso.datetime(),
            })
            .strict(),
        )
        .max(50),
      nextAfter: z.number().int().min(1).max(2000).nullable(),
      readSequence: z.number().int().min(0).max(2000),
    })
    .strict(),
  SupportTicketPage: z
    .object({
      items: z.array(communicationThread).max(30),
      nextCursor: uuid.nullable(),
    })
    .strict(),
};
export type JobContext = z.infer<typeof jobContextBody>;
export type TicketInput = z.infer<typeof ticketBody>;
export type StatusInput = z.infer<typeof ticketStatusBody>;
export type TicketQuery = z.infer<typeof ticketPageQuery>;
