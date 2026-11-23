import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CallRepository } from './call.repository.js';
import { CallAccessService } from './call-access.service.js';
import { CallRequestsService } from './call-requests.service.js';
import { CallAdmissionService } from './call-admission.service.js';
import type { CreateCall } from '../contracts/call.schemas.js';
import type { CallRecord } from '../contracts/call-records.js';
@Injectable()
export class CallCreateService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(CallRepository) private readonly repo: CallRepository,
    @Inject(CallAccessService) private readonly access: CallAccessService,
    @Inject(CallRequestsService) private readonly requests: CallRequestsService,
    @Inject(CallAdmissionService)
    private readonly admission: CallAdmissionService,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  async create(a: Actor, key: string, raw: CreateCall) {
    await this.admission.admit(a, 'create');
    const input = {
      ...raw,
      jobId: raw.jobId.toLowerCase(),
      peerUserId: raw.peerUserId.toLowerCase(),
      deviceId: raw.deviceId.toLowerCase(),
    };
    const fingerprint = this.requests.fingerprint([
      input.jobType,
      input.jobId,
      input.peerUserId,
      input.deviceId,
      input.deviceGeneration,
      this.requests.proof(input.proof),
    ]);
    return this.tx.run(async (c) => {
      const eligible = await this.access.job(
        c,
        a,
        input.jobType,
        input.jobId,
        input.peerUserId,
      );
      const previous = await this.requests.replay(
        c,
        a,
        'CREATE',
        key,
        fingerprint,
      );
      if (previous) return previous;
      if (!eligible)
        throw new BusinessError(
          'CALL_NOT_ELIGIBLE',
          'Call participants are not eligible',
        );
      const now = await this.repo.now(c);
      await this.access.device(c, a, input, now);
      if (await this.repo.recentPair(c, a.userId, input.peerUserId, now))
        throw new BusinessError(
          'CALL_COOLDOWN',
          'Wait before calling this participant again',
        );
      const r: CallRecord = {
        id: randomUUID(),
        jobId: input.jobId,
        jobType: input.jobType,
        callerUserId: a.userId,
        calleeUserId: input.peerUserId,
        callerSessionId: a.sessionId,
        callerDeviceId: input.deviceId,
        callerDeviceGeneration: input.deviceGeneration,
        calleeSessionId: null,
        calleeDeviceId: null,
        calleeDeviceGeneration: null,
        status: 'RINGING',
        version: 1,
        signalEpoch: 0,
        ringExpiresAt: new Date(now.getTime() + 30000),
        connectExpiresAt: null,
        acceptedAt: null,
        endedAt: null,
        endReason: null,
        lastCheckedAt: now,
        createdAt: now,
      };
      await this.repo.create(c, r);
      await this.repo.claimAccounts(c, r);
      await this.repo.event(c, r, 'call.ringing', a.userId);
      await this.audit.record(c, a.userId, 'calling.created', r.id);
      return this.requests.record(c, a, 'CREATE', key, fingerprint, r);
    });
  }
}
