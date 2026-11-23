export interface NotificationDispatch {
  deliveryId: string;
  notificationId: string;
  deviceId: string;
  generation: number;
  token: string;
}
export type NotificationProviderResult =
  | 'CAPTURED'
  | 'RETRY'
  | 'INVALID_DEVICE';
export abstract class NotificationProvider {
  abstract send(
    work: NotificationDispatch,
    signal: AbortSignal,
  ): Promise<NotificationProviderResult>;
}
