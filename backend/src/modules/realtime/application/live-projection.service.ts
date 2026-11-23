import { Inject, Injectable } from '@nestjs/common';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { RidesFacade } from '../../rides/rides.facade.js';
import { DeliveriesFacade } from '../../deliveries/deliveries.facade.js';
import type { LiveAuth, LiveSnapshot } from '../contracts/realtime.schemas.js';
import { liveSnapshot } from '../contracts/realtime.schemas.js';
/** Token signature/expiry/session and current job participation are checked per emission. */
@Injectable()
export class LiveProjectionService {
  constructor(
    @Inject(IdentityFacade) readonly identity: IdentityFacade,
    @Inject(RidesFacade) private readonly rides: RidesFacade,
    @Inject(DeliveriesFacade) private readonly deliveries: DeliveriesFacade,
  ) {}
  async read(input: LiveAuth, previousVersion: number): Promise<LiveSnapshot> {
    const actor = await this.identity.authenticate(input.accessToken);
    const p =
      input.jobType === 'RIDE'
        ? await this.rides.liveSnapshot(actor, input.jobId)
        : await this.deliveries.liveSnapshot(actor, input.jobId);
    return liveSnapshot.parse({
      ...p,
      schemaVersion: 1,
      type: 'job.snapshot',
      position: p.position
        ? { ...p.position, receivedAt: p.position.receivedAt.toISOString() }
        : null,
      resyncRequired:
        previousVersion === 0 ||
        previousVersion > p.version ||
        p.version > previousVersion + 1,
      observedAt: new Date().toISOString(),
    });
  }
}
