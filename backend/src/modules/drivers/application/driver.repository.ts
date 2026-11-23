import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  DriverRecord,
  DocumentRecord,
  DriverStatus,
  DriverClass,
  PresenceRecord,
} from '../contracts/driver-contracts.js';
import type {
  VehicleInput,
  DocumentInput,
  LocationInput,
  ReviewInput,
} from '../contracts/driver.schemas.js';
export abstract class DriverRepository {
  abstract candidates(
    pickup: { latitude: number; longitude: number },
    radiusMeters: number,
    serviceClass: DriverClass,
    excludeUserId: string,
  ): Promise<{ ownerUserId: string; distanceMeters: number }[]>;
  abstract reviews(id: string): Promise<
    {
      applicationRevision: number;
      decision: string;
      reason: string;
      createdAt: Date;
    }[]
  >;
  abstract findOwner(
    ownerId: string,
    context?: TransactionContext,
  ): Promise<DriverRecord | null>;
  abstract find(
    id: string,
    context?: TransactionContext,
  ): Promise<DriverRecord | null>;
  abstract ensure(
    context: TransactionContext,
    ownerId: string,
  ): Promise<DriverRecord>;
  abstract lock(context: TransactionContext, id: string): Promise<void>;
  abstract change(
    context: TransactionContext,
    id: string,
    data: {
      status?: DriverStatus;
      revision?: number;
      approvedClasses?: DriverClass[];
      submittedAt?: Date | null;
      reviewedAt?: Date | null;
    },
  ): Promise<void>;
  abstract saveVehicle(
    context: TransactionContext,
    id: string,
    input: VehicleInput,
  ): Promise<void>;
  abstract documents(
    id: string,
    revision: number,
    context?: TransactionContext,
  ): Promise<DocumentRecord[]>;
  abstract document(
    id: string,
    context?: TransactionContext,
  ): Promise<DocumentRecord | null>;
  abstract createDocument(
    context: TransactionContext,
    driver: DriverRecord,
    input: DocumentInput,
  ): Promise<DocumentRecord>;
  abstract storeDocument(
    context: TransactionContext,
    id: string,
  ): Promise<void>;
  abstract review(
    context: TransactionContext,
    driver: DriverRecord,
    reviewerId: string,
    input: ReviewInput,
    documentIds: string[],
  ): Promise<void>;
  abstract markDocuments(
    context: TransactionContext,
    ids: string[],
    approved: boolean,
  ): Promise<void>;
  abstract setPresence(
    context: TransactionContext,
    driverId: string,
    sessionId: string,
    online: boolean,
  ): Promise<PresenceRecord>;
  abstract acceptLocation(
    context: TransactionContext,
    driverId: string,
    input: LocationInput,
  ): Promise<PresenceRecord>;
  abstract list(limit: number, cursor?: string): Promise<DriverRecord[]>;
}
