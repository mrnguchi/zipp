import { DeliveryLiveService } from './application/delivery-live.service.js';
import type { Actor } from '../../shared/contracts/actor.js';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveryDispatchService } from './application/delivery-dispatch.service.js';
import { DeliveryRepository } from './application/delivery.repository.js';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import { DeliveryAccessService } from './application/delivery-access.service.js';
import { DeliveriesConfig } from './deliveries.config.js';
import { BusinessError } from '../../shared/errors/business-error.js';
@Injectable()
export class DeliveriesFacade {
  /** Caller holds the target identity lock; include bound contacts, not only the
   * booker/courier shared-job assignment, so handover/return cannot be stranded. */
  async assertOperationsCanSuspend(c: TransactionContext, userId: string) {
    if (await this.repo.activeContact(c, userId))
      throw new BusinessError(
        'ACTIVE_JOB_CONFLICT',
        'Resolve active delivery contact responsibilities before suspension',
      );
  }
  async operationsSummary(c: TransactionContext, a: Actor, id: string) {
    return this.access.operationsSummary(c, a, id);
  }
  callingContext(c: TransactionContext, a: Actor, id: string, peer: string) {
    this.config.assertEnabled();
    return this.access.callingContext(c, a, id, peer);
  }
  communicationContext(c: TransactionContext, actor: Actor, id: string) {
    this.config.assertEnabled();
    return this.access.communicationContext(c, actor, id);
  }
  liveSnapshot(actor: Actor, id: string) {
    return this.live.snapshot(actor, id);
  }
  constructor(
    @Inject(DeliveryAccessService)
    private readonly access: DeliveryAccessService,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
    @Inject(DeliveryLiveService) private readonly live: DeliveryLiveService,
    @Inject(DeliveryDispatchService)
    private readonly dispatch: DeliveryDispatchService,
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
  ) {}
  dueDispatchTasks(limit = 20) {
    return this.repo.dueTasks(Math.min(20, Math.max(1, limit)));
  }
  executeDispatch(id: string) {
    return this.dispatch.execute(id);
  }
}
