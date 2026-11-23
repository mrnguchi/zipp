import { Inject, Injectable } from '@nestjs/common';
import { RideRepository } from './ride.repository.js';
import { RideAccessService } from './ride-access.service.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { DriversFacade } from '../../drivers/drivers.facade.js';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import type { RideRecord } from '../contracts/ride-contracts.js';
import { assertParticipant, terminal } from '../domain/ride-rules.js';
export const rideView = (r: RideRecord) => ({
  id: r.id,
  status: r.status,
  version: r.version,
  customerUserId: r.customerUserId,
  driverUserId: r.driverUserId,
  serviceClass: r.serviceClass,
  currency: 'XAF',
  quotedAmountXaf: r.quotedAmountXaf.toString(),
  chargedAmountXaf: r.chargedAmountXaf.toString(),
  cancellationFeeXaf: r.cancellationFeeXaf.toString(),
  pickup: { latitude: r.pickupLatitude, longitude: r.pickupLongitude },
  destination: {
    latitude: r.destinationLatitude,
    longitude: r.destinationLongitude,
  },
  distanceMeters: r.distanceMeters,
  durationSeconds: r.durationSeconds,
  pricingPolicyVersion: r.pricingPolicyVersion,
  searchExpiresAt: r.searchExpiresAt,
  createdAt: r.createdAt,
  assignedAt: r.assignedAt,
  arrivedAt: r.arrivedAt,
  startedAt: r.startedAt,
  completedAt: r.completedAt,
  cancellationReason: r.cancellationReason,
});
@Injectable()
export class RideReadService {
  constructor(
    @Inject(RideRepository) private readonly repository: RideRepository,
    @Inject(RideAccessService) private readonly access: RideAccessService,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(DriversFacade) private readonly drivers: DriversFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
  ) {}
  async get(actor: Actor, id: string) {
    const row = await this.repository.ride(id);
    if (!row) throw new BusinessError('NOT_FOUND', 'Ride not found');
    assertParticipant(row, actor.userId);
    return row;
  }
  async history(actor: Actor, limit: number, cursor?: string) {
    const rows = await this.repository.history(actor.userId, limit, cursor);
    return {
      items: rows.map(rideView),
      nextCursor: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }
  async active(actor: Actor) {
    return {
      items: (await this.repository.active(actor.userId)).map(rideView),
    };
  }
  async offers(actor: Actor) {
    const rows = await this.repository.driverOffers(actor.userId);
    return {
      items: rows.map((offer) => ({
        id: offer.id,
        rideId: offer.rideId,
        serviceClass: offer.ride.serviceClass,
        pickup: {
          latitude: offer.ride.pickupLatitude,
          longitude: offer.ride.pickupLongitude,
        },
        quotedAmountXaf: offer.ride.quotedAmountXaf.toString(),
        currency: 'XAF',
        radiusMeters: offer.radiusMeters,
        expiresAt: offer.expiresAt,
      })),
    };
  }
  async snapshot(actor: Actor, id: string) {
    const row = await this.get(actor, id);
    const [events, rating, dispute] = await Promise.all([
      this.repository.events(id, Math.max(0, row.version - 10)),
      this.repository.rating(id),
      this.repository.dispute(id),
    ]);
    return {
      ...rideView(row),
      rating,
      dispute: dispute
        ? {
            reason: dispute.reason,
            resolution: dispute.resolution,
            resolutionReason: dispute.resolutionReason,
            resolvedAt: dispute.resolvedAt,
            createdAt: dispute.createdAt,
          }
        : null,
      events: events
        .filter((event) => event.aggregateVersion <= row.version)
        .map((event) => ({
          id: event.id,
          type: event.eventType,
          schemaVersion: event.schemaVersion,
          aggregateId: event.rideId,
          aggregateVersion: event.aggregateVersion,
          occurredAt: event.occurredAt,
          payload: { rideId: event.rideId },
        })),
      dispatch: await this.repository.taskInfo(id),
    };
  }
  async events(actor: Actor, id: string, afterVersion: number) {
    const ride = await this.get(actor, id);
    return {
      rideId: id,
      currentVersion: ride.version,
      items: (await this.repository.events(id, afterVersion))
        .filter((event) => event.aggregateVersion <= ride.version)
        .map((event) => ({
          id: event.id,
          type: event.eventType,
          schemaVersion: event.schemaVersion,
          aggregateId: event.rideId,
          aggregateVersion: event.aggregateVersion,
          occurredAt: event.occurredAt,
          payload: { rideId: event.rideId },
        })),
      nextAction:
        'Fetch the current ride snapshot after missed or conflicting versions',
    };
  }
  async tracking(actor: Actor, id: string) {
    return this.transactions.run(async (context) => {
      const initial = await this.repository.ride(id, context);
      if (!initial) throw new BusinessError('NOT_FOUND', 'Ride not found');
      assertParticipant(initial, actor.userId);
      await this.identity.authorize(context, actor, [], false, [
        initial.customerUserId,
        ...(initial.driverUserId ? [initial.driverUserId] : []),
      ]);
      if (terminal(initial.status) || !initial.driverUserId)
        return { rideId: id, available: false, reason: 'NO_ACTIVE_ASSIGNMENT' };
      // Read the driver aggregate before job/ride to match assignment/lifecycle lock order.
      let position;
      let stale: boolean;
      try {
        const info = await this.drivers.trackingPosition(
          context,
          initial.driverUserId,
          initial.serviceClass,
        );
        position = info.position;
        stale = info.stale;
      } catch (error) {
        if (
          error instanceof BusinessError ||
          (error instanceof ApiError && error.getStatus() === 401)
        )
          return {
            rideId: id,
            available: false,
            reason: 'LOCATION_NOT_FRESH_OR_DRIVER_INELIGIBLE',
          };
        throw error;
      }
      const { ride } = await this.access.lock(context, actor, id);
      assertParticipant(ride, actor.userId);
      if (terminal(ride.status) || ride.driverUserId !== initial.driverUserId)
        return { rideId: id, available: false, reason: 'NO_ACTIVE_ASSIGNMENT' };
      return {
        rideId: id,
        available: true,
        stale,
        location: {
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyMeters: position.accuracyMeters,
          capturedAt: position.capturedAt,
          receivedAt: position.receivedAt,
          freshUntil: position.receivedAt
            ? new Date(position.receivedAt.getTime() + 15000)
            : null,
          sequence: position.sequence,
          locationSessionId: position.locationSessionId,
        },
        version: ride.version,
      };
    });
  }
  async receipt(actor: Actor, id: string) {
    const ride = await this.get(actor, id);
    if (!terminal(ride.status))
      throw new BusinessError(
        'INVALID_TRANSITION',
        'Receipt is available after the ride ends',
      );
    const dispute = await this.repository.dispute(id);
    const refunded =
      dispute?.resolution === 'refund' ? ride.chargedAmountXaf : 0n;
    const fee = (ride.chargedAmountXaf * BigInt(ride.commissionBps)) / 10000n;
    return {
      rideId: id,
      status: ride.status,
      currency: 'XAF',
      quotedAmountXaf: ride.quotedAmountXaf.toString(),
      chargedAmountXaf: ride.chargedAmountXaf.toString(),
      refundedAmountXaf: refunded.toString(),
      netPaidAmountXaf: (ride.chargedAmountXaf - refunded).toString(),
      ...(actor.userId === ride.driverUserId
        ? {
            driverEarningsXaf: (refunded > 0n
              ? 0n
              : ride.chargedAmountXaf - fee
            ).toString(),
            platformCommissionXaf: (refunded > 0n ? 0n : fee).toString(),
          }
        : {}),
      pricingPolicyVersion: ride.pricingPolicyVersion,
      completedAt: ride.completedAt,
    };
  }
}
