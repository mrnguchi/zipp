import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CallRelayConfig } from '../call-relay.config.js';
import { CallAccessService } from './call-access.service.js';
import { CallRepository } from './call.repository.js';
import { CallStateService } from './call-state.service.js';
import { CallAdmissionService } from './call-admission.service.js';
import { CallRelay } from './call-relay.port.js';
import type { RelayGrant } from './call-relay.port.js';
import type { RelayCredentialRequest } from '../contracts/call.schemas.js';
import { assertCallVersion, dueCall } from '../domain/call-rules.js';

@Injectable()
export class CallRelayService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(CallAccessService) private readonly access: CallAccessService,
    @Inject(CallRepository) private readonly repo: CallRepository,
    @Inject(CallStateService) private readonly state: CallStateService,
    @Inject(CallAdmissionService)
    private readonly admission: CallAdmissionService,
    @Inject(CallRelayConfig) private readonly config: CallRelayConfig,
    @Inject(CallRelay) private readonly relay: CallRelay,
  ) {}
  private async grant(
    a: Actor,
    id: string,
    input: RelayCredentialRequest,
  ): Promise<RelayGrant> {
    const result = await this.tx.run<RelayGrant | { error: string }>(
      async (c) => {
        const { call: r, eligible } = await this.access.current(c, a, id);
        const now = await this.repo.now(c),
          due = dueCall(r, now);
        if (due) {
          await this.state.finish(c, r, due.status, due.reason, a.userId, now);
          return { error: 'CALL_EXPIRED' };
        }
        if (!eligible)
          throw new BusinessError(
            'CALL_NOT_ELIGIBLE',
            'Call participants are not eligible',
          );
        if (
          r.status !== 'CONNECTING' ||
          !r.acceptedAt ||
          !r.connectExpiresAt ||
          !r.calleeSessionId ||
          !r.calleeDeviceId ||
          !r.calleeDeviceGeneration ||
          r.signalEpoch !== input.epoch
        )
          throw new BusinessError('CALL_NOT_READY', 'Call is not negotiating');
        assertCallVersion(r, input.expectedVersion);
        await this.access.device(c, a, input, now);
        this.access.assertClaim(r, a, input);
        // Fixed accepted-epoch expiry makes retries deterministic and avoids new
        // usernames that would multiply coturn's per-user allocation quota. This
        // diagnostic setup grant is NOT a renewable ongoing-call lease.
        const expiresAt = new Date(
          (Math.floor(r.acceptedAt.getTime() / 1000) + 60) * 1000,
        );
        if (expiresAt <= now)
          throw new BusinessError('CALL_EXPIRED', 'Call credentials expired');
        const side =
          a.userId === r.callerUserId
            ? ('CALLER' as const)
            : ('CALLEE' as const);
        return {
          callId: r.id,
          version: r.version,
          epoch: r.signalEpoch,
          side,
          expiresAt,
          serverTime: now,
          scope: [
            r.id,
            r.signalEpoch,
            r.callerSessionId,
            r.callerDeviceId,
            r.callerDeviceGeneration,
            r.calleeSessionId,
            r.calleeDeviceId,
            r.calleeDeviceGeneration,
            side,
          ],
        };
      },
    );
    if ('error' in result)
      throw new BusinessError(result.error, 'Call setup expired');
    return result;
  }
  async issue(a: Actor, id: string, input: RelayCredentialRequest) {
    this.config.assertEnabled();
    await this.admission.admit(a, 'relay');
    const before = await this.grant(a, id, input);
    const credentials = this.relay.mint(before); // Pure crypto outside DB locks.
    const after = await this.grant(a, id, input);
    if (
      after.version !== before.version ||
      after.epoch !== before.epoch ||
      after.expiresAt.getTime() !== before.expiresAt.getTime() ||
      JSON.stringify(after.scope) !== JSON.stringify(before.scope)
    )
      throw new BusinessError('CALL_STATE_CHANGED', 'Reload the current call');
    return { ...credentials, serverTime: after.serverTime.toISOString() };
  }
}
