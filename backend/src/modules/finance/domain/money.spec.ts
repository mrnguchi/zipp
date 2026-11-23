import { describe, expect, it } from '@jest/globals';
import {
  availableFunds,
  paymentAmount,
  splitCapture,
  splitRefund,
} from './money.js';

describe('exact XAF conservation', () => {
  it('rejects decimals, signs, leading zeroes and oversized payments', () => {
    for (const value of ['0', '-1', '1.5', '01', '1e3', '1000000001'])
      expect(() => paymentAmount(value)).toThrow();
    expect(paymentAmount('1000000000')).toBe(1_000_000_000n);
  });
  it('never authorizes reserved funds as spendable', () => {
    expect(() => availableFunds(10000n, 8000n, 2001n)).toThrow();
    expect(() => availableFunds(10000n, 8000n, 2000n)).not.toThrow();
  });
  it('conserves every whole XAF across commission and cumulative partial refunds', () => {
    for (const feeBasisPoints of [0, 1, 999, 1000, 3333, 10000]) {
      const total = 10003n;
      const capture = splitCapture(total, feeBasisPoints);
      expect(capture.platformFeeXaf + capture.beneficiaryAmountXaf).toBe(total);
      let refunded = 0n;
      let driver = 0n;
      let platform = 0n;
      for (const amount of [1n, 333n, 2000n, 7669n]) {
        const split = splitRefund(
          total,
          capture.platformFeeXaf,
          refunded,
          amount,
        );
        expect(split.beneficiaryAmountXaf + split.platformAmountXaf).toBe(
          amount,
        );
        refunded += amount;
        driver += split.beneficiaryAmountXaf;
        platform += split.platformAmountXaf;
      }
      expect(driver).toBe(capture.beneficiaryAmountXaf);
      expect(platform).toBe(capture.platformFeeXaf);
      expect(() =>
        splitRefund(total, capture.platformFeeXaf, refunded, 1n),
      ).toThrow();
    }
  });
});
