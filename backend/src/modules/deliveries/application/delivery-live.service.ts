import { DeliveriesConfig } from '../deliveries.config.js';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveryAccessService } from './delivery-access.service.js';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import type {
  LiveJobProjection,
  LivePosition,
} from '../../../shared/contracts/live-job.js';
import { deliveryTerminal } from '../domain/delivery-rules.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { ApiError } from '../../../shared/errors/api-error.js';
@Injectable()
export class DeliveryLiveService {
  constructor(
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
    @Inject(DeliveryAccessService)
    private readonly access: DeliveryAccessService,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
  ) {}
  snapshot(a: Actor, id: string): Promise<LiveJobProjection> {
    this.config.assertEnabled();
    return this.tx.run(async (c) => {
      const initial = await this.access.authorize(c, a, id);
      let position: LivePosition | null = null;
      if (!deliveryTerminal(initial.status) && initial.courierUserId) {
        try {
          const p =
            initial.custody === 'WITH_COURIER'
              ? await this.access.drivers.custodyPosition(
                  c,
                  initial.courierUserId,
                )
              : (
                  await this.access.drivers.trackingPosition(
                    c,
                    initial.courierUserId,
                    initial.serviceClass,
                  )
                ).position;
          if (p.latitude !== null && p.longitude !== null && p.receivedAt)
            position = {
              latitude: p.latitude,
              longitude: p.longitude,
              receivedAt: p.receivedAt,
              stale: Date.now() - p.receivedAt.getTime() > 15000,
            };
        } catch (e) {
          if (
            !(e instanceof BusinessError) &&
            !(e instanceof ApiError && e.getStatus() === 401)
          )
            throw e;
        }
      }
      const { delivery: d } = await this.access.lock(c, a, id);
      const ended = deliveryTerminal(d.status);
      return {
        jobType: 'DELIVERY',
        jobId: id,
        version: d.version,
        status: d.status,
        custody: d.custody,
        terminal: ended,
        position: ended ? null : position,
      };
    });
  }
}
