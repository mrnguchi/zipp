import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { CallAccessService } from './call-access.service.js';
import { CallRepository } from './call.repository.js';
import { CallAdmissionService } from './call-admission.service.js';
import { CallStateService } from './call-state.service.js';
import { callView } from '../contracts/call-records.js';
import { dueCall, callTerminal } from '../domain/call-rules.js';
@Injectable()
export class CallReadService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(CallAccessService) private readonly access: CallAccessService,
    @Inject(CallRepository) private readonly repo: CallRepository,
    @Inject(CallAdmissionService)
    private readonly admission: CallAdmissionService,
    @Inject(CallStateService) private readonly state: CallStateService,
  ) {}
  async snapshot(a: Actor, id: string) {
    await this.admission.admit(a, 'read');
    return this.tx.run(async (c) => {
      const r = await this.access.original(c, a, id),
        now = await this.repo.now(c),
        due = dueCall(r, now);
      if (due)
        await this.state.finish(c, r, due.status, due.reason, a.userId, now);
      return callView(r, a.userId);
    });
  }
  async active(a: Actor) {
    await this.admission.admit(a, 'read');
    return this.tx.run(async (c) => {
      const first = await this.repo.active(c, a.userId);
      if (!first) {
        await this.access.identity.authorize(c, a);
        return { call: null };
      }
      const r = await this.access.original(c, a, first.id),
        current = await this.repo.active(c, a.userId);
      if (current?.id !== r.id) return { call: null };
      const now = await this.repo.now(c),
        due = dueCall(r, now);
      if (due)
        await this.state.finish(c, r, due.status, due.reason, a.userId, now);
      return { call: callTerminal(r.status) ? null : callView(r, a.userId) };
    });
  }
}
