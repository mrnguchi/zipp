import { z } from 'zod';
export const financialKey = z
  .uuid({ version: 'v4' })
  .transform((value) => value.toLowerCase());
export const financialAmount = z
  .string()
  .regex(/^(?:[1-9][0-9]{0,8}|1000000000)$/);
export const paymentBody = z.strictObject({ amountXaf: financialAmount });
export const withdrawalReviewBody = z.strictObject({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(10).max(300),
});
export const financeQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid({ version: 'v4' }).optional(),
});
export const reconciliationBody = z.strictObject({
  reason: z.string().trim().min(10).max(300),
});
export const financeSchemas = {
  PaymentRequest: paymentBody,
  WithdrawalReview: withdrawalReviewBody,
  PaymentReconciliation: reconciliationBody,
};
export const financialPaymentCommand = z.strictObject({
  id: z.uuid({ version: 'v4' }),
  schemaVersion: z.literal(1),
});
