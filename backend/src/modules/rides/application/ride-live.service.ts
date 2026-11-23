import { RidesConfig } from '../rides.config.js';
import { Inject, Injectable } from '@nestjs/common';
import { RideAccessService } from './ride-access.service.js';
import { RideRepository } from './ride.repository.js';
import { DriversFacade } from '../../drivers/drivers.facade.js';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import type {
  LiveJobProjection,
  LivePosition,
} from '../../../shared/contracts/live-job.js';
import { terminal, assertParticipant } from '../domain/ride-rules.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
@Injectable()
export class RideLiveService {
  constructor(
    @Inject(RidesConfig) private readonly config: RidesConfig,
    @Inject(RideAccessService) private readonly access: RideAccessService,
    @Inject(RideRepository) private readonly repo: RideRepository,
    @Inject(DriversFacade) private readonly drivers: DriversFacade,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
  ) {}
  snapshot(a: Actor, id: string): Promise<LiveJobProjection> {
    this.config.assertEnabled();
    return this.tx.run(async (c) => {
      const initial = await this.access.authorize(c, a, id);
      assertParticipant(initial, a.userId);
      let position: LivePosition | null = null;
      // Preserve participant -> driver -> job ordering; unavailable GPS is not an assignment change.
      if (!terminal(initial.status) && initial.driverUserId) {
        try {
          const info = await this.drivers.trackingPosition(
              c,
              initial.driverUserId,
              initial.serviceClass,
            ),
            p = info.position;
          if (p.latitude !== null && p.longitude !== null && p.receivedAt)
            position = {
              latitude: p.latitude,
              longitude: p.longitude,
              receivedAt: p.receivedAt,
              stale: info.stale,
            };
        } catch (e) {
          if (
            !(e instanceof BusinessError) &&
            !(e instanceof ApiError && e.getStatus() === 401)
          )
            throw e;
        }
      }
      await this.jobs.lock(c, id);
      await this.repo.lock(c, id);
      const current = await this.repo.ride(id, c);
      if (!current || current.driverUserId !== initial.driverUserId)
        throw new BusinessError('RIDE_STATE_CHANGED', 'Retry the current ride');
      assertParticipant(current, a.userId);
      const ended = terminal(current.status);
      return {
        jobType: 'RIDE',
        jobId: id,
        version: current.version,
        status: current.status,
        custody: null,
        terminal: ended,
        position: ended ? null : position,
      };
    });
  }
}
