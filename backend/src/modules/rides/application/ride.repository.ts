import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  RideRecord,
  RidePatch,
  RideRequestRecord,
  OfferRecord,
  RideEventRecord,
  DispatchClaim,
  RideDisputeRecord,
} from '../contracts/ride-contracts.js';
export abstract class RideRepository {
  abstract taskInfo(id: string): Promise<{
    reviewRequired: boolean;
    availableAt: Date;
    completedAt: Date | null;
  } | null>;
  abstract ride(
    id: string,
    context?: TransactionContext,
  ): Promise<RideRecord | null>;
  abstract lock(context: TransactionContext, id: string): Promise<void>;
  abstract activeCustomerRide(
    context: TransactionContext,
    customerId: string,
  ): Promise<boolean>;
  abstract create(
    context: TransactionContext,
    data: Pick<
      RideRecord,
      | 'id'
      | 'customerUserId'
      | 'quoteId'
      | 'reservationId'
      | 'serviceAreaId'
      | 'serviceClass'
      | 'quotedAmountXaf'
      | 'commissionBps'
      | 'cancellationFeeXaf'
      | 'pickupLatitude'
      | 'pickupLongitude'
      | 'destinationLatitude'
      | 'destinationLongitude'
      | 'distanceMeters'
      | 'durationSeconds'
      | 'pricingPolicyVersion'
    >,
    area: Record<string, number>,
  ): Promise<RideRecord>;
  abstract transition(
    context: TransactionContext,
    id: string,
    patch: RidePatch,
    eventType: string,
  ): Promise<RideRecord>;
  abstract security(
    context: TransactionContext,
    id: string,
    patch: RidePatch,
  ): Promise<void>;
  abstract request(
    context: TransactionContext,
    actorId: string,
    action: string,
    key: string,
  ): Promise<RideRequestRecord | null>;
  abstract remember(
    context: TransactionContext,
    actorId: string,
    action: string,
    key: string,
    fingerprint: string,
    rideId: string,
    reason?: string,
  ): Promise<void>;
  abstract offer(
    id: string,
    context?: TransactionContext,
  ): Promise<OfferRecord | null>;
  abstract createOffers(
    context: TransactionContext,
    ride: RideRecord,
    driverIds: string[],
    wave: number,
    radius: number,
  ): Promise<void>;
  abstract offersForRide(
    context: TransactionContext,
    rideId: string,
  ): Promise<OfferRecord[]>;
  abstract respondOffer(
    context: TransactionContext,
    id: string,
    status: 'ACCEPTED' | 'DECLINED',
  ): Promise<void>;
  abstract withdrawOffers(
    context: TransactionContext,
    rideId: string,
    acceptedId?: string,
  ): Promise<void>;
  abstract driverOffers(
    driverId: string,
  ): Promise<(OfferRecord & { ride: RideRecord })[]>;
  abstract history(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<RideRecord[]>;
  abstract active(userId: string): Promise<RideRecord[]>;
  abstract events(
    rideId: string,
    afterVersion: number,
  ): Promise<RideEventRecord[]>;
  abstract rate(
    context: TransactionContext,
    ride: RideRecord,
    stars: number,
    comment?: string,
  ): Promise<void>;
  abstract rating(
    rideId: string,
  ): Promise<{ stars: number; comment: string | null; createdAt: Date } | null>;
  abstract dispute(
    rideId: string,
    context?: TransactionContext,
  ): Promise<RideDisputeRecord | null>;
  abstract openDispute(
    context: TransactionContext,
    rideId: string,
    userId: string,
    reason: string,
  ): Promise<void>;
  abstract resolveDispute(
    context: TransactionContext,
    rideId: string,
    userId: string,
    resolution: 'release' | 'refund',
    reason: string,
  ): Promise<void>;
  abstract dueTasks(limit: number): Promise<string[]>;
  abstract claimTask(rideId: string): Promise<DispatchClaim | null>;
  abstract ownsTask(
    context: TransactionContext,
    claim: DispatchClaim,
  ): Promise<boolean>;
  abstract scheduleTask(
    context: TransactionContext,
    claim: DispatchClaim,
    availableAt: Date | null,
    reviewRequired?: boolean,
    failed?: boolean,
  ): Promise<void>;
  abstract stopTask(context: TransactionContext, rideId: string): Promise<void>;
  abstract retryTask(
    context: TransactionContext,
    rideId: string,
  ): Promise<void>;
}
