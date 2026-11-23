import { describe, expect, it } from '@jest/globals';
import {
  financeQuery,
  financialKey,
  paymentBody,
  withdrawalReviewBody,
} from './finance.schemas.js';
import { FinanceConfig } from '../finance.config.js';

describe('financial transport/configuration boundaries', () => {
  it('accepts only exact bounded amounts and rejects client ownership/outcome claims', () => {
    expect(paymentBody.safeParse({ amountXaf: '5000' }).success).toBe(true);
    for (const body of [
      { amountXaf: 5000 },
      { amountXaf: '5000', ownerUserId: 'other' },
      { amountXaf: '5000', status: 'CONFIRMED' },
      { amountXaf: '5000', simulatedOutcome: 'success' },
    ])
      expect(paymentBody.safeParse(body).success).toBe(false);
    expect(financialKey.safeParse('not-a-key').success).toBe(false);
    expect(financeQuery.safeParse({ limit: '51' }).success).toBe(false);
    expect(
      withdrawalReviewBody.safeParse({ decision: 'approve', reason: 'ok' })
        .success,
    ).toBe(false);
  });
  it('fails closed without explicit local configuration and rejects production mocks', () => {
    expect(() => new FinanceConfig({}).assertEnabled()).toThrow();
    expect(
      () =>
        new FinanceConfig({
          PAYMENTS_ENABLED: 'true',
          PAYMENT_ADAPTER: 'local',
          NODE_ENV: 'production',
        }),
    ).toThrow();
    expect(
      () =>
        new FinanceConfig({
          PAYMENTS_ENABLED: 'true',
          PAYMENT_ADAPTER: 'unknown',
          NODE_ENV: 'development',
        }),
    ).toThrow();
  });
});
