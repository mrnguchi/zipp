import { Inject, Injectable } from '@nestjs/common';
import { AuditPort } from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { CallRepository } from './call.repository.js';
import type { CallRecord } from '../contracts/call-records.js';
import type { CallStatus } from '../contracts/call.schemas.js';
import { callTerminal } from '../domain/call-rules.js';
@Injectable()
export class CallStateService {
  constructor(
    @Inject(CallRepository) private readonly repo: CallRepository,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  /** Caller owns identity/job (if needed)/call locks. Never releases a mobility assignment. */
  async finish(
    c: TransactionContext,
    r: CallRecord,
    status: CallStatus,
    reason: string,
    actor: string | null,
    now: Date,
  ) {
    if (callTerminal(r.status)) return;
    r.status = status;
    r.endReason = reason;
    r.endedAt = now;
    r.lastCheckedAt = now;
    r.version++;
    await this.repo.save(c, r);
    await this.repo.releaseAccounts(c, r.id);
    await this.repo.event(c, r, `call.${status.toLowerCase()}`, actor);
    await this.audit.record(c, actor, `calling.${status.toLowerCase()}`, r.id);
  }
}
