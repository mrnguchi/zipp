import { Inject, Injectable } from '@nestjs/common';
import { IdentityFacade } from '../../identity/identity.facade.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CallRepository } from './call.repository.js';
import type { CallOperation, CallRecord } from '../contracts/call-records.js';
@Injectable()
export class CallRequestsService {
  constructor(
    @Inject(CallRepository) private readonly repo: CallRepository,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
  ) {}
  fingerprint(input: readonly unknown[]) {
    return this.identity.pseudonym('calling.request', JSON.stringify(input));
  }
  proof(value: string) {
    return this.identity.pseudonym('calling.proof', value);
  }
  async replay(
    c: TransactionContext,
    a: Actor,
    op: CallOperation,
    key: string,
    fingerprint: string,
  ) {
    const row = await this.repo.command(c, a.userId, op, key);
    if (!row) return null;
    if (row.fingerprint !== fingerprint)
      throw new BusinessError(
        'IDEMPOTENCY_CONFLICT',
        'Key was used with different input',
      );
    return { callId: row.callId, version: row.version, status: row.status };
  }
  async record(
    c: TransactionContext,
    a: Actor,
    op: CallOperation,
    key: string,
    fingerprint: string,
    r: CallRecord,
  ) {
    const receipt = { callId: r.id, version: r.version, status: r.status };
    await this.repo.receipt(c, a.userId, op, key, fingerprint, receipt);
    return receipt;
  }
}
