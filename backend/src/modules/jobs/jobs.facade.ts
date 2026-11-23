import { Inject, Injectable } from '@nestjs/common';
import { JobsRepository } from './application/jobs.repository.js';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../shared/errors/business-error.js';
@Injectable()
export class JobsFacade {
  constructor(
    @Inject(JobsRepository) private readonly repository: JobsRepository,
  ) {}
  create(
    context: TransactionContext,
    id: string,
    customerUserId: string,
    jobType: 'RIDE' | 'DELIVERY',
  ) {
    return this.repository.create(context, id, customerUserId, jobType);
  }
  lock(context: TransactionContext, id: string) {
    return this.repository.lock(context, id);
  }
  claim(context: TransactionContext, id: string, driverUserId: string) {
    return this.repository.claim(context, id, driverUserId);
  }
  close(context: TransactionContext, id: string) {
    return this.repository.close(context, id);
  }
  async freeDriverIds(ids: string[]) {
    const busy = new Set(await this.repository.busyDriverIds(ids));
    return ids.filter((id) => !busy.has(id));
  }
  async assertDriverFree(context: TransactionContext, driverUserId: string) {
    if (await this.repository.driverBusy(context, driverUserId))
      throw new BusinessError(
        'DRIVER_BUSY',
        'Driver already has an active job',
      );
  }
  async assertAccountCanClose(context: TransactionContext, userId: string) {
    if (await this.repository.activeForUser(context, userId))
      throw new BusinessError(
        'ACTIVE_JOB_CONFLICT',
        'Resolve active jobs before account deletion',
      );
  }
}
