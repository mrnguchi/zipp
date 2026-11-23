import { z } from 'zod';
const uuid = z.uuid({ version: 'v4' });
export const subjectType = z.enum([
  'ACCOUNT',
  'DRIVER',
  'RIDE',
  'DELIVERY',
  'PAYMENT',
]);
export const caseStatus = z.enum([
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'DISMISSED',
]);
export const reasonCode = z.enum([
  'SAFETY_CONCERN',
  'SERVICE_COMPLAINT',
  'DUPLICATE_ACTIVITY',
  'PAYMENT_MISMATCH',
  'REVIEW_COMPLETED',
  'INSUFFICIENT_EVIDENCE',
  'OTHER',
]);
export const operationsKey = uuid;
export const openCaseBody = z
  .object({
    subjectType,
    subjectId: uuid,
    reasonCode,
    description: z.string().trim().min(10).max(2000),
  })
  .strict();
export const reviewCaseBody = z
  .object({
    expectedVersion: z.number().int().min(1).max(999),
    status: caseStatus,
    reasonCode,
  })
  .strict();
export const accountCaseBody = z
  .object({
    expectedVersion: z.number().int().min(1).max(999),
    expectedAccountStatus: z.enum(['ACTIVE', 'SUSPENDED']),
    accountStatus: z.enum(['ACTIVE', 'SUSPENDED']),
    reasonCode,
  })
  .strict();
export const caseQuery = z
  .object({
    subjectType: subjectType.optional(),
    status: caseStatus.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    afterId: uuid.optional(),
  })
  .strict();
export const eventQuery = z
  .object({
    afterVersion: z.coerce.number().int().min(0).max(1000).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const subjectQuery = z.object({ reasonCode }).strict();
export const reportQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    afterId: uuid.optional(),
  })
  .strict();
export const operationsReceipt = z
  .object({
    caseId: uuid,
    version: z.number().int().min(1).max(1000),
    status: caseStatus,
    accountStatus: z.enum(['ACTIVE', 'SUSPENDED']).nullable(),
  })
  .strict();
export const caseView = z
  .object({
    id: uuid,
    subjectType,
    subjectId: uuid,
    reasonCode,
    description: z.string().min(10).max(2000),
    status: caseStatus,
    version: z.number().int(),
    openedByUserId: uuid,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const eventView = z
  .object({
    id: uuid,
    caseId: uuid,
    version: z.number().int(),
    action: z.enum(['OPEN', 'REVIEW', 'ACCOUNT_STATUS']),
    status: caseStatus,
    reasonCode,
    actorUserId: uuid,
    accountStatus: z.enum(['ACTIVE', 'SUSPENDED']).nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const subjectView = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('ACCOUNT'),
      summary: z
        .object({
          id: uuid,
          status: z.enum([
            'PENDING',
            'ACTIVE',
            'SUSPENDED',
            'DELETION_REQUESTED',
          ]),
          roles: z
            .array(
              z.enum(['CUSTOMER', 'DRIVER', 'SUPPORT', 'FINANCE', 'ADMIN']),
            )
            .max(5),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('DRIVER'),
      summary: z
        .object({
          id: uuid,
          ownerUserId: uuid,
          status: z.enum([
            'DRAFT',
            'SUBMITTED',
            'APPROVED',
            'REJECTED',
            'SUSPENDED',
          ]),
          revision: z.number().int(),
          approvedClasses: z.array(z.string()).max(5),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('RIDE'),
      summary: z
        .object({
          id: uuid,
          status: z.string(),
          customerUserId: uuid,
          driverUserId: uuid.nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('DELIVERY'),
      summary: z
        .object({
          id: uuid,
          status: z.string(),
          custody: z.string(),
          bookerUserId: uuid,
          courierUserId: uuid.nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('PAYMENT'),
      summary: z
        .object({
          id: uuid,
          ownerUserId: uuid,
          operationType: z.enum(['TOP_UP', 'WITHDRAWAL']),
          status: z.string(),
          amountXaf: z.string().regex(/^\d+$/),
          currency: z.literal('XAF'),
        })
        .strict(),
    })
    .strict(),
]);
export const operationsSchemas = {
  OpenOperationsCase: openCaseBody,
  ReviewOperationsCase: reviewCaseBody,
  ChangeOperationsAccount: accountCaseBody,
  OperationsReceipt: operationsReceipt,
  OperationsCase: caseView,
  OperationsCasePage: z
    .object({ items: z.array(caseView).max(50), nextAfterId: uuid.nullable() })
    .strict(),
  OperationsEventPage: z
    .object({
      items: z.array(eventView).max(50),
      nextAfterVersion: z.number().int(),
    })
    .strict(),
  OperationsSubject: subjectView,
  OperationsCapabilities: z
    .object({
      caseTypes: z.array(subjectType).max(5),
      accountStatusChanges: z.boolean(),
      financeReports: z.boolean(),
      automaticFraudDecisions: z.literal(false),
      arbitraryFinancialAdjustments: z.literal(false),
    })
    .strict(),
  OperationsFinanceReport: z
    .object({
      scope: z.literal('PAGE'),
      currency: z.literal('XAF'),
      requestedAmountXaf: z.string().regex(/^\d+$/),
      providerReconciled: z.literal(false),
      items: z
        .array(
          z
            .object({
              id: uuid,
              ownerUserId: uuid,
              operationType: z.enum(['TOP_UP', 'WITHDRAWAL']),
              status: z.string(),
              amountXaf: z.string().regex(/^\d+$/),
              createdAt: z.iso.datetime(),
            })
            .strict(),
        )
        .max(50),
      nextAfterId: uuid.nullable(),
    })
    .strict(),
};
export type SubjectType = z.infer<typeof subjectType>;
export type CaseStatus = z.infer<typeof caseStatus>;
export type ReasonCode = z.infer<typeof reasonCode>;
export type OpenCase = z.infer<typeof openCaseBody>;
export type ReviewCase = z.infer<typeof reviewCaseBody>;
export type AccountCase = z.infer<typeof accountCaseBody>;
export type CaseQuery = z.infer<typeof caseQuery>;
export type Receipt = z.infer<typeof operationsReceipt>;
