import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { FinanceRepository } from './finance.repository.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { FinancialOperationRecord } from '../contracts/finance-contracts.js';
import { BusinessError } from '../../../shared/errors/business-error.js';

@Injectable()
export class FinancialRequestService {
  constructor(
    @Inject(FinanceRepository) private readonly repository: FinanceRepository,
  ) {}
  fingerprint(fields: readonly string[]): string {
    return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  }
  async replay(
    context: TransactionContext,
    actorId: string,
    type: string,
    key: string,
    fingerprint: string,
  ): Promise<FinancialOperationRecord | null> {
    const request = await this.repository.request(context, actorId, type, key);
    if (!request) return null;
    if (request.requestFingerprint !== fingerprint)
      throw new BusinessError(
        'IDEMPOTENCY_CONFLICT',
        'Request key has different input',
      );
    const operation = await this.repository.operation(
      request.operationId,
      context,
    );
    if (!operation)
      throw new Error('Persisted request references a missing operation');
    // Retain the key identity. A response window expiry never becomes another payment.
    if (
      operation.responseExpiresAt &&
      Date.now() >= operation.responseExpiresAt.getTime()
    )
      throw new BusinessError(
        'IDEMPOTENCY_KEY_EXPIRED',
        'Retrieve the existing operation status',
        operation.id,
      );
    return operation;
  }
}
