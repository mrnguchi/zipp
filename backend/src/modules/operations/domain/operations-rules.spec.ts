import { describe, expect, it } from '@jest/globals';
import {
  operationsRoles,
  assertCaseTransition,
  assertCaseVersion,
} from './operations-rules.js';
import {
  openCaseBody,
  accountCaseBody,
} from '../contracts/operations.schemas.js';
import { OperationsConfig } from '../operations.config.js';
describe('M7 operations policies (written, not run)', () => {
  it('keeps finance cases separate from support', () => {
    expect(operationsRoles('PAYMENT')).toEqual(['FINANCE', 'ADMIN']);
    expect(operationsRoles('DELIVERY')).toEqual(['SUPPORT', 'ADMIN']);
  });
  it('requires review before resolution and permits explicit reopening', () => {
    expect(() => assertCaseTransition('OPEN', 'RESOLVED')).toThrow();
    expect(() => assertCaseTransition('RESOLVED', 'IN_REVIEW')).not.toThrow();
    expect(() => assertCaseTransition('IN_REVIEW', 'IN_REVIEW')).toThrow();
  });
  it('rejects stale versions and bounds retained events', () => {
    expect(() => assertCaseVersion(3, 2)).toThrow();
    expect(() => assertCaseVersion(1000, 1000)).toThrow();
  });
  it('defaults off and requires identity', () => {
    expect(new OperationsConfig({}).enabled).toBe(false);
    expect(
      () => new OperationsConfig({ OPERATIONS_ENABLED: 'true' }),
    ).toThrow();
  });
  it('rejects role, balance and forced-job fields', () => {
    expect(
      openCaseBody.safeParse({
        subjectType: 'ACCOUNT',
        subjectId: '11111111-1111-4111-8111-111111111111',
        reasonCode: 'OTHER',
        description: 'A bounded review',
        roles: ['ADMIN'],
      }).success,
    ).toBe(false);
    expect(
      accountCaseBody.safeParse({
        expectedVersion: 2,
        expectedAccountStatus: 'ACTIVE',
        accountStatus: 'SUSPENDED',
        reasonCode: 'OTHER',
        forceDelivered: true,
      }).success,
    ).toBe(false);
  });
});
