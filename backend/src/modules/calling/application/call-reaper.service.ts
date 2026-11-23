import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { NotificationsFacade } from '../../notifications/notifications.facade.js';
import { CallRepository } from './call.repository.js';
import { CallStateService } from './call-state.service.js';
import { CallingConfig } from '../calling.config.js';
import { dueCall, callTerminal } from '../domain/call-rules.js';
@Injectable()
export class CallReaperService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(NotificationsFacade) private readonly devices: NotificationsFacade,
    @Inject(CallRepository) private readonly repo: CallRepository,
    @Inject(CallStateService) private readonly state: CallStateService,
    @Inject(CallingConfig) private readonly config: CallingConfig,
  ) {}
  async reap(shouldStop: () => boolean = () => false) {
    if (!this.config.reaperEnabled) return;
    for (const id of await this.repo.candidates()) {
      if (shouldStop()) break;
      await this.tx.run(async (c) => {
        const first = await this.repo.get(c, id);
        if (!first) return;
        await this.identity.lockUsers(c, [
          first.callerUserId,
          first.calleeUserId,
        ]);
        const r = await this.repo.get(c, id, true);
        if (!r || callTerminal(r.status)) return;
        const now = await this.repo.now(c),
          due = dueCall(r, now);
        if (due) {
          await this.state.finish(c, r, due.status, due.reason, null, now);
          return;
        }
        const caller =
          (await this.identity.notificationEligible(
            c,
            r.callerUserId,
            r.callerSessionId,
          )) &&
          (await this.devices.currentCallDevice(
            c,
            r.callerUserId,
            r.callerSessionId,
            r.callerDeviceId,
            r.callerDeviceGeneration,
            now,
          ));
        const callee =
          (await this.identity.notificationEligible(
            c,
            r.calleeUserId,
            r.calleeSessionId ?? undefined,
          )) &&
          (!r.calleeSessionId ||
            !r.calleeDeviceId ||
            !r.calleeDeviceGeneration ||
            (await this.devices.currentCallDevice(
              c,
              r.calleeUserId,
              r.calleeSessionId,
              r.calleeDeviceId,
              r.calleeDeviceGeneration,
              now,
            )));
        if (!caller || !callee)
          await this.state.finish(
            c,
            r,
            'FAILED',
            'PARTICIPANT_UNAVAILABLE',
            null,
            now,
          );
        else await this.repo.checked(c, r.id, now);
      });
    }
  }
}
