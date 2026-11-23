import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CallRepository } from './call.repository.js';
import { CallAccessService } from './call-access.service.js';
import { CallRequestsService } from './call-requests.service.js';
import { CallAdmissionService } from './call-admission.service.js';
import { CallStateService } from './call-state.service.js';
import type { CallAction } from '../contracts/call.schemas.js';
import {
  callTerminal,
  dueCall,
  assertCallVersion,
} from '../domain/call-rules.js';
@Injectable()
export class CallLifecycleService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(CallRepository) private readonly repo: CallRepository,
    @Inject(CallAccessService) private readonly access: CallAccessService,
    @Inject(CallRequestsService) private readonly requests: CallRequestsService,
    @Inject(CallAdmissionService)
    private readonly admission: CallAdmissionService,
    @Inject(CallStateService) private readonly state: CallStateService,
  ) {}
  async command(
    a: Actor,
    key: string,
    id: string,
    operation: 'ACCEPT' | 'REJECT' | 'END',
    input: CallAction,
  ) {
    await this.admission.admit(a, 'action');
    const fingerprint = this.requests.fingerprint([
      id.toLowerCase(),
      input.expectedVersion,
      input.deviceId.toLowerCase(),
      input.deviceGeneration,
      this.requests.proof(input.proof),
    ]);
    const result = await this.tx.run(async (c) => {
      const context =
        operation === 'END'
          ? { call: await this.access.original(c, a, id), eligible: true }
          : await this.access.current(c, a, id);
      const r = context.call,
        previous = await this.requests.replay(
          c,
          a,
          operation,
          key,
          fingerprint,
        );
      if (previous) return previous;
      if (operation === 'END' && callTerminal(r.status))
        return this.requests.record(c, a, operation, key, fingerprint, r);
      const now = await this.repo.now(c),
        due = dueCall(r, now);
      if (due) {
        await this.state.finish(c, r, due.status, due.reason, a.userId, now);
        return { error: 'CALL_EXPIRED' };
      }
      if (callTerminal(r.status))
        throw new BusinessError('CALL_TERMINAL', 'Call has ended');
      if (!context.eligible) {
        await this.state.finish(
          c,
          r,
          'FAILED',
          'PARTICIPANT_UNAVAILABLE',
          a.userId,
          now,
        );
        return { error: 'CALL_NOT_ELIGIBLE' };
      }
      await this.access.device(c, a, input, now);
      if (operation === 'ACCEPT') {
        if (a.userId !== r.calleeUserId)
          throw new BusinessError('FORBIDDEN', 'Only the callee can answer');
        if (r.status !== 'RINGING')
          throw new BusinessError(
            'CALL_ALREADY_ANSWERED',
            'Call has already been answered',
          );
        assertCallVersion(r, input.expectedVersion);
        r.calleeSessionId = a.sessionId;
        r.calleeDeviceId = input.deviceId.toLowerCase();
        r.calleeDeviceGeneration = input.deviceGeneration;
        r.acceptedAt = now;
        r.connectExpiresAt = new Date(now.getTime() + 30000);
        r.status = 'CONNECTING';
        r.signalEpoch = 1;
        r.version++;
        await this.repo.save(c, r);
        await this.repo.event(c, r, 'call.accepted', a.userId);
      } else if (operation === 'REJECT') {
        if (a.userId !== r.calleeUserId || r.status !== 'RINGING')
          throw new BusinessError(
            'INVALID_TRANSITION',
            'Call cannot be rejected',
          );
        assertCallVersion(r, input.expectedVersion);
        await this.state.finish(c, r, 'REJECTED', 'DECLINED', a.userId, now);
      } else {
        this.access.assertClaim(r, a, input);
        assertCallVersion(r, input.expectedVersion);
        await this.state.finish(c, r, 'ENDED', 'USER_ENDED', a.userId, now);
      }
      return this.requests.record(c, a, operation, key, fingerprint, r);
    });
    // Timeout/eligibility closure must commit before the transport error; throwing
    // in the transaction would roll back the slot release and metadata event.
    if ('error' in result)
      throw new BusinessError(result.error, 'Call is no longer available');
    return result;
  }
}
