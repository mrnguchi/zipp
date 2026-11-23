import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CallAccessService } from './call-access.service.js';
import { CallRepository } from './call.repository.js';
import { CallStateService } from './call-state.service.js';
import { CallAdmissionService } from './call-admission.service.js';
import { CallSignals } from './call-signals.port.js';
import { CallingConfig } from '../calling.config.js';
import type {
  CallDevice,
  SendSignal,
  ReadSignals,
} from '../contracts/call.schemas.js';
import type { SignalGrant } from '../contracts/call-records.js';
import { dueCall, assertSignalOrder } from '../domain/call-rules.js';
@Injectable()
export class CallSignalingService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(CallAccessService) private readonly access: CallAccessService,
    @Inject(CallRepository) private readonly repo: CallRepository,
    @Inject(CallStateService) private readonly state: CallStateService,
    @Inject(CallAdmissionService)
    private readonly admission: CallAdmissionService,
    @Inject(CallSignals) private readonly signals: CallSignals,
    @Inject(CallingConfig) private readonly config: CallingConfig,
  ) {}
  private async grant(
    a: Actor,
    id: string,
    input: CallDevice,
    epoch: number,
  ): Promise<SignalGrant> {
    const result = await this.tx.run<SignalGrant | { error: string }>(
      async (c) => {
        const { call: r, eligible } = await this.access.current(c, a, id),
          now = await this.repo.now(c),
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
          !r.connectExpiresAt ||
          r.signalEpoch !== epoch
        )
          throw new BusinessError('CALL_NOT_READY', 'Call is not negotiating');
        await this.access.device(c, a, input, now);
        this.access.assertClaim(r, a, input);
        return {
          callId: r.id,
          version: r.version,
          epoch: r.signalEpoch,
          side:
            a.userId === r.callerUserId
              ? ('CALLER' as const)
              : ('CALLEE' as const),
          expiresAt: r.connectExpiresAt,
        };
      },
    );
    if ('error' in result)
      throw new BusinessError(result.error, 'Call negotiation expired');
    return result;
  }
  async send(a: Actor, id: string, input: SendSignal) {
    this.config.assertSignaling();
    await this.admission.admit(a, 'signal');
    const grant = await this.grant(a, id, input, input.epoch);
    assertSignalOrder(grant.side, input.packet);
    const result = await this.signals.send(grant, input.packet);
    const current = await this.grant(a, id, input, input.epoch);
    if (current.version !== grant.version)
      throw new BusinessError('CALL_STATE_CHANGED', 'Reload the current call');
    return result;
  }
  async read(a: Actor, id: string, input: ReadSignals) {
    this.config.assertSignaling();
    await this.admission.admit(a, 'read');
    const grant = await this.grant(a, id, input, input.epoch);
    const result = await this.signals.read(grant, input.afterSequence);
    const current = await this.grant(a, id, input, input.epoch);
    if (current.version !== grant.version)
      throw new BusinessError('CALL_STATE_CHANGED', 'Reload the current call');
    return result;
  }
}
