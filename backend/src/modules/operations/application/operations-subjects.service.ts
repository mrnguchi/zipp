import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/contracts/actor.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { DriversFacade } from '../../drivers/drivers.facade.js';
import { RidesFacade } from '../../rides/rides.facade.js';
import { DeliveriesFacade } from '../../deliveries/deliveries.facade.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import type { SubjectType } from '../contracts/operations.schemas.js';
@Injectable()
export class OperationsSubjectsService {
  constructor(
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(DriversFacade) private readonly drivers: DriversFacade,
    @Inject(RidesFacade) private readonly rides: RidesFacade,
    @Inject(DeliveriesFacade) private readonly deliveries: DeliveriesFacade,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
  ) {}
  // Owning facades take the entire sorted identity lock set before the job lock.
  // Do not first lock only the staff actor here: that reverses job lock ordering.
  async summary(
    c: TransactionContext,
    a: Actor,
    type: SubjectType,
    id: string,
  ) {
    switch (type) {
      case 'ACCOUNT':
        return {
          type,
          summary: await this.identity.operationsSummary(c, a, id),
        };
      case 'DRIVER':
        return {
          type,
          summary: await this.drivers.operationsSummary(c, a, id),
        };
      case 'RIDE':
        return { type, summary: await this.rides.operationsSummary(c, a, id) };
      case 'DELIVERY':
        return {
          type,
          summary: await this.deliveries.operationsSummary(c, a, id),
        };
      case 'PAYMENT':
        return {
          type,
          summary: await this.finance.operationsSummary(c, a, id),
        };
    }
  }
}
