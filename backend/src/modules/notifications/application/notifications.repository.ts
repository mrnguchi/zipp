import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  DeviceRecord,
  NotificationIntent,
  InboxRecord,
  DeliveryRecord,
  DeliveryStatus,
} from '../contracts/notification-records.js';
import type { NotificationPage } from '../contracts/notification.schemas.js';
export abstract class NotificationsRepository {
  abstract assertSchema(): Promise<void>;
  abstract now(c: TransactionContext): Promise<Date>;
  abstract device(
    c: TransactionContext,
    id: string,
    lock?: boolean,
  ): Promise<DeviceRecord | null>;
  abstract devices(
    c: TransactionContext,
    owner: string,
    now: Date,
  ): Promise<DeviceRecord[]>;
  abstract tokenOwner(
    c: TransactionContext,
    hash: string,
  ): Promise<string | null>;
  abstract saveDevice(
    c: TransactionContext,
    device: DeviceRecord,
    create: boolean,
  ): Promise<void>;
  abstract enqueue(
    c: TransactionContext,
    sourceEventId: string,
    recipient: string,
  ): Promise<void>;
  abstract intent(
    c: TransactionContext,
    id: string,
    lock?: boolean,
  ): Promise<NotificationIntent | null>;
  abstract completeIntent(
    c: TransactionContext,
    id: string,
    now: Date,
  ): Promise<void>;
  abstract materialize(
    c: TransactionContext,
    intent: NotificationIntent,
    devices: DeviceRecord[],
    now: Date,
  ): Promise<void>;
  abstract inbox(
    c: TransactionContext,
    owner: string,
    query: NotificationPage,
  ): Promise<InboxRecord[]>;
  abstract readInbox(
    c: TransactionContext,
    owner: string,
    id: string,
    now: Date,
  ): Promise<InboxRecord | null>;
  abstract due(): Promise<{ kind: 'MATERIALIZE' | 'DISPATCH'; id: string }[]>;
  abstract delivery(
    c: TransactionContext,
    id: string,
    lock?: boolean,
  ): Promise<DeliveryRecord | null>;
  abstract claim(
    c: TransactionContext,
    delivery: DeliveryRecord,
    token: string,
    now: Date,
  ): Promise<DeliveryRecord>;
  abstract finish(
    c: TransactionContext,
    id: string,
    status: DeliveryStatus,
    now: Date,
    availableAt?: Date,
  ): Promise<void>;
}
