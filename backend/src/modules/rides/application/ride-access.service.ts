import { Inject, Injectable } from '@nestjs/common';
import { RideRepository } from './ride.repository.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import { DriversFacade } from '../../drivers/drivers.facade.js';
import type { Actor, Role } from '../../../shared/contracts/actor.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { terminal, assertParticipant } from '../domain/ride-rules.js';
@Injectable()
export class RideAccessService {
  async callingContext(
    c: TransactionContext,
    a: Actor,
    id: string,
    peer: string,
  ) {
    const { ride } = await this.lock(c, a, id, [], false, false, [peer]);
    assertParticipant(ride, a.userId);
    return {
      eligible:
        !terminal(ride.status) &&
        !!ride.driverUserId &&
        a.userId !== peer &&
        ((a.userId === ride.customerUserId && peer === ride.driverUserId) ||
          (a.userId === ride.driverUserId && peer === ride.customerUserId)),
    };
  }
  /** Authorize in the caller's transaction; job lock serializes sends with termination. */
  async communicationContext(c: TransactionContext, actor: Actor, id: string) {
    const { ride } = await this.lock(c, actor, id);
    assertParticipant(ride, actor.userId);
    return {
      writable: !terminal(ride.status),
      participantUserIds: [
        ride.customerUserId,
        ...(ride.driverUserId ? [ride.driverUserId] : []),
      ],
    };
  }
  constructor(
    @Inject(RideRepository) private readonly repository: RideRepository,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(DriversFacade) private readonly drivers: DriversFacade,
  ) {}
  async authorize(
    context: TransactionContext,
    actor: Actor,
    id: string,
    roles: readonly Role[] = [],
    mfa = false,
    otherUserIds: readonly string[] = [],
  ) {
    const initial = await this.repository.ride(id, context);
    if (!initial) throw new BusinessError('NOT_FOUND', 'Ride not found');
    await this.identity.authorize(context, actor, roles, mfa, [
      initial.customerUserId,
      ...(initial.driverUserId ? [initial.driverUserId] : []),
      ...otherUserIds,
    ]);
    const current = await this.repository.ride(id, context);
    if (!current) throw new BusinessError('NOT_FOUND', 'Ride not found');
    if (current.driverUserId !== initial.driverUserId)
      throw new BusinessError(
        'RIDE_STATE_CHANGED',
        'Ride assignment changed; retry with the same request key',
      );
    return current;
  }
  async lock(
    context: TransactionContext,
    actor: Actor,
    id: string,
    roles: readonly Role[] = [],
    mfa = false,
    requireDriverLocation = false,
    otherUserIds: readonly string[] = [],
  ) {
    const initial = await this.authorize(
      context,
      actor,
      id,
      roles,
      mfa,
      otherUserIds,
    );
    if (requireDriverLocation && initial.driverUserId !== actor.userId)
      throw new BusinessError('NOT_FOUND', 'Assigned ride not found');
    const position = requireDriverLocation
      ? await this.drivers.assertDispatchEligible(
          context,
          actor.userId,
          initial.serviceClass,
          false,
        )
      : null;
    await this.jobs.lock(context, id);
    await this.repository.lock(context, id);
    const current = await this.repository.ride(id, context);
    if (!current) throw new BusinessError('NOT_FOUND', 'Ride not found');
    // Assignment may have committed between the initial read and acquiring user locks.
    // Retry from the beginning instead of acquiring an extra user lock out of order.
    if (current.driverUserId !== initial.driverUserId)
      throw new BusinessError(
        'RIDE_STATE_CHANGED',
        'Ride assignment changed; retry with the same request key',
      );
    return { ride: current, position: position?.location ?? null };
  }
}
