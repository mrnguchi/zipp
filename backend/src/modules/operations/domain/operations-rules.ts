import type { Role } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import type {
  SubjectType,
  CaseStatus,
} from '../contracts/operations.schemas.js';
export const operationsRoles = (type: SubjectType): readonly Role[] =>
  type === 'PAYMENT' ? ['FINANCE', 'ADMIN'] : ['SUPPORT', 'ADMIN'];
export function assertCaseTransition(current: CaseStatus, next: CaseStatus) {
  const allowed: Record<CaseStatus, readonly CaseStatus[]> = {
    OPEN: ['IN_REVIEW', 'DISMISSED'],
    IN_REVIEW: ['RESOLVED', 'DISMISSED'],
    RESOLVED: ['IN_REVIEW'],
    DISMISSED: ['IN_REVIEW'],
  };
  if (!allowed[current].includes(next))
    throw new BusinessError(
      'INVALID_TRANSITION',
      'Case transition is not allowed',
    );
}
export function assertCaseVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new BusinessError('CASE_VERSION_CONFLICT', 'Reload the current case');
  if (actual >= 1000)
    throw new BusinessError('CASE_VERSION_LIMIT', 'Case history limit reached');
}
