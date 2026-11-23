import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  BookDeliveryInput,
  PhotoInput,
  ProofPurpose,
} from '../contracts/delivery.schemas.js';
import type {
  DeliveryRecord,
  DeliveryPatch,
  PhotoRecord,
  DeliveryOfferRecord,
  DeliveryProofRecord,
  ProofPatch,
  DeliveryIssueRecord,
  TrackingRecord,
  DeliveryEventRecord,
  DeliveryClaim,
} from '../contracts/delivery-contracts.js';
export type NewDelivery = Pick<
  DeliveryRecord,
  | 'id'
  | 'bookerUserId'
  | 'senderUserId'
  | 'recipientUserId'
  | 'quoteId'
  | 'reservationId'
  | 'serviceAreaId'
  | 'serviceClass'
  | 'quotedAmountXaf'
  | 'commissionBps'
  | 'cancellationFeeXaf'
  | 'pricingPolicyVersion'
  | 'pickupLatitude'
  | 'pickupLongitude'
  | 'destinationLatitude'
  | 'destinationLongitude'
  | 'distanceMeters'
  | 'durationSeconds'
>;
export abstract class DeliveryRepository {
  abstract activeContact(
    context: TransactionContext,
    userId: string,
  ): Promise<boolean>;
  abstract get(
    id: string,
    context?: TransactionContext,
  ): Promise<DeliveryRecord | null>;
  abstract lock(context: TransactionContext, id: string): Promise<void>;
  abstract activeBookerCount(
    context: TransactionContext,
    userId: string,
  ): Promise<number>;
  abstract create(
    context: TransactionContext,
    data: NewDelivery,
    input: BookDeliveryInput,
    area: Record<string, number>,
  ): Promise<DeliveryRecord>;
  abstract transition(
    context: TransactionContext,
    id: string,
    patch: DeliveryPatch,
    type: string,
  ): Promise<DeliveryRecord>;
  abstract request(
    context: TransactionContext,
    userId: string,
    action: string,
    key: string,
  ): Promise<{
    deliveryId: string;
    requestFingerprint: string;
    createdAt: Date;
  } | null>;
  abstract remember(
    context: TransactionContext,
    userId: string,
    action: string,
    key: string,
    fingerprint: string,
    deliveryId: string,
    reason?: string,
  ): Promise<void>;
  abstract photo(
    id: string,
    context?: TransactionContext,
  ): Promise<PhotoRecord | null>;
  abstract lockPhoto(context: TransactionContext, id: string): Promise<void>;
  abstract recentPhotoCount(
    context: TransactionContext,
    ownerId: string,
  ): Promise<number>;
  abstract createPhoto(
    context: TransactionContext,
    ownerId: string,
    input: PhotoInput,
  ): Promise<PhotoRecord>;
  abstract photoUsed(id: string, context: TransactionContext): Promise<boolean>;
  abstract storePhoto(context: TransactionContext, id: string): Promise<void>;
  abstract deliveryByPhoto(id: string): Promise<DeliveryRecord | null>;
  abstract offer(
    id: string,
    context?: TransactionContext,
  ): Promise<DeliveryOfferRecord | null>;
  abstract offers(
    context: TransactionContext,
    id: string,
  ): Promise<DeliveryOfferRecord[]>;
  abstract createOffers(
    context: TransactionContext,
    d: DeliveryRecord,
    courierIds: string[],
    wave: number,
    radius: number,
  ): Promise<void>;
  abstract respondOffer(
    context: TransactionContext,
    id: string,
    status: 'ACCEPTED' | 'DECLINED',
  ): Promise<void>;
  abstract withdrawOffers(
    context: TransactionContext,
    id: string,
    acceptedId?: string,
  ): Promise<void>;
  abstract courierOffers(
    userId: string,
  ): Promise<(DeliveryOfferRecord & { delivery: DeliveryRecord })[]>;
  abstract list(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<DeliveryRecord[]>;
  abstract active(userId: string): Promise<DeliveryRecord[]>;
  abstract events(id: string, after: number): Promise<DeliveryEventRecord[]>;
  abstract proof(
    context: TransactionContext,
    id: string,
    purpose: ProofPurpose,
  ): Promise<DeliveryProofRecord | null>;
  abstract updateProof(
    context: TransactionContext,
    id: string,
    purpose: ProofPurpose,
    data: ProofPatch,
  ): Promise<void>;
  abstract invalidateProof(
    context: TransactionContext,
    id: string,
    purpose: ProofPurpose,
    hash: string,
  ): Promise<void>;
  abstract issue(
    id: string,
    context?: TransactionContext,
  ): Promise<DeliveryIssueRecord | null>;
  abstract issues(
    id: string,
    context?: TransactionContext,
  ): Promise<DeliveryIssueRecord[]>;
  abstract createIssue(
    context: TransactionContext,
    id: string,
    userId: string,
    kind: string,
    reason: string,
  ): Promise<DeliveryIssueRecord>;
  abstract resolveIssue(
    context: TransactionContext,
    id: string,
    userId: string,
    resolution: string,
    reason: string,
  ): Promise<void>;
  abstract rate(
    context: TransactionContext,
    d: DeliveryRecord,
    stars: number,
    comment?: string,
  ): Promise<void>;
  abstract rating(
    id: string,
  ): Promise<{ stars: number; comment: string | null; createdAt: Date } | null>;
  abstract capabilities(
    id: string,
    context?: TransactionContext,
  ): Promise<TrackingRecord[]>;
  abstract capability(
    id: string,
    context?: TransactionContext,
  ): Promise<TrackingRecord | null>;
  abstract createCapability(
    context: TransactionContext,
    id: string,
    data: {
      id: string;
      issuedById: string;
      tokenHash: string;
      requestedTtlSeconds: number;
      expiresAt: Date;
    },
  ): Promise<void>;
  abstract revokeCapability(
    context: TransactionContext,
    id: string,
    deliveryId: string,
  ): Promise<void>;
  abstract taskInfo(id: string): Promise<{
    reviewRequired: boolean;
    availableAt: Date;
    completedAt: Date | null;
  } | null>;
  abstract dueTasks(limit: number): Promise<string[]>;
  abstract claimTask(id: string): Promise<DeliveryClaim | null>;
  abstract ownsTask(
    context: TransactionContext,
    claim: DeliveryClaim,
  ): Promise<boolean>;
  abstract scheduleTask(
    context: TransactionContext,
    claim: DeliveryClaim,
    next: Date | null,
    review?: boolean,
    failed?: boolean,
  ): Promise<void>;
  abstract stopTask(context: TransactionContext, id: string): Promise<void>;
  abstract retryTask(context: TransactionContext, id: string): Promise<void>;
}
