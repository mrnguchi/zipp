import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RideRepository } from './ride.repository.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class RideRequestService {
  constructor(
    @Inject(RideRepository) private readonly repository: RideRepository,
  ) {}
  fingerprint(fields: readonly string[]) {
    return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  }
  async replay(
    context: TransactionContext,
    userId: string,
    action: string,
    key: string,
    fingerprint: string,
  ) {
    const previous = await this.repository.request(
      context,
      userId,
      action,
      key,
    );
    if (!previous) return null;
    if (previous.requestFingerprint !== fingerprint)
      throw new BusinessError(
        'IDEMPOTENCY_CONFLICT',
        'Request key has different input',
      );
    const ride = await this.repository.ride(previous.rideId, context);
    if (!ride) throw new Error('Ride request references a missing ride');
    if (
      ride.completedAt &&
      Date.now() >=
        Math.max(ride.completedAt.getTime(), previous.createdAt.getTime()) +
          86400_000
    )
      throw new BusinessError(
        'IDEMPOTENCY_KEY_EXPIRED',
        'Retrieve the existing ride status',
        ride.id,
      );
    return ride;
  }
}
