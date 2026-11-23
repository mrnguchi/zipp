import { Inject, Injectable } from '@nestjs/common';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { RidesFacade } from '../../rides/rides.facade.js';
import { DeliveriesFacade } from '../../deliveries/deliveries.facade.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { JobContext } from '../contracts/communication.schemas.js';
import { CommunicationsRepository } from './communications.repository.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class CommunicationAccessService {
  constructor(
    @Inject(IdentityFacade) readonly identity: IdentityFacade,
    @Inject(RidesFacade) private readonly rides: RidesFacade,
    @Inject(DeliveriesFacade) private readonly deliveries: DeliveriesFacade,
    @Inject(CommunicationsRepository) readonly repo: CommunicationsRepository,
  ) {}
  job(c: TransactionContext, actor: Actor, job: JobContext) {
    return job.jobType === 'RIDE'
      ? this.rides.communicationContext(c, actor, job.jobId)
      : this.deliveries.communicationContext(c, actor, job.jobId);
  }
  async thread(c: TransactionContext, actor: Actor, id: string) {
    const initial = await this.repo.thread(c, id);
    if (!initial)
      throw new BusinessError('NOT_FOUND', 'Conversation not found');
    let writable: boolean;
    let participantUserIds: string[];
    if (initial.kind === 'JOB') {
      if (!initial.jobId || !initial.jobType)
        throw new Error('Invalid persisted job thread');
      const context = await this.job(c, actor, {
        jobId: initial.jobId,
        jobType: initial.jobType,
      });
      writable = context.writable;
      participantUserIds = context.participantUserIds;
    } else {
      // Current owner/session or narrowly scoped support + MFA; input roles are never trusted.
      await this.identity.authorize(
        c,
        actor,
        actor.userId === initial.creatorUserId ? [] : ['SUPPORT', 'ADMIN'],
        actor.userId !== initial.creatorUserId,
        [initial.creatorUserId],
      );
      writable = true;
      participantUserIds = [initial.creatorUserId];
    }
    const thread = await this.repo.lock(c, id);
    return {
      thread,
      writable: writable && thread.status === 'OPEN',
      participantUserIds,
    };
  }
}
