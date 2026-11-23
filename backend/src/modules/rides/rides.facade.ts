import { RideLiveService } from './application/ride-live.service.js';
import type { Actor } from '../../shared/contracts/actor.js';
import { Inject, Injectable } from '@nestjs/common';
import { RideDispatchService } from './application/ride-dispatch.service.js';
import { RideRepository } from './application/ride.repository.js';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import { RideAccessService } from './application/ride-access.service.js';
import { RidesConfig } from './rides.config.js';
import { BusinessError } from '../../shared/errors/business-error.js';
@Injectable()
export class RidesFacade {
  async operationsSummary(c: TransactionContext, a: Actor, id: string) {
    const { ride: r } = await this.access.lock(
      c,
      a,
      id,
      ['SUPPORT', 'ADMIN'],
      true,
    );
    if (!r) throw new BusinessError('NOT_FOUND', 'Ride not found');
    return {
      id: r.id,
      status: r.status,
      customerUserId: r.customerUserId,
      driverUserId: r.driverUserId,
    };
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
    @Inject(RideAccessService) private readonly access: RideAccessService,
    @Inject(RidesConfig) private readonly config: RidesConfig,
    @Inject(RideLiveService) private readonly live: RideLiveService,
    @Inject(RideDispatchService) private readonly dispatch: RideDispatchService,
    @Inject(RideRepository) private readonly repository: RideRepository,
  ) {}
  dueDispatchTasks(limit = 20) {
    return this.repository.dueTasks(Math.min(20, Math.max(1, limit)));
  }
  executeDispatch(rideId: string) {
    return this.dispatch.execute(rideId);
  }
}
