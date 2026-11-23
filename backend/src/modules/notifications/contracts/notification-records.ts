export interface DeviceRecord {
  id: string;
  ownerUserId: string;
  sessionId: string;
  platform: string;
  provider: string;
  proofHash: string;
  tokenHash: string;
  tokenCiphertext: string | null;
  generation: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface NotificationIntent {
  id: string;
  sourceEventId: string;
  recipientUserId: string;
  eventType: string;
  expiresAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}
export interface InboxRecord {
  id: string;
  ownerUserId: string;
  readAt: Date | null;
  createdAt: Date;
}
export type DeliveryStatus =
  | 'PENDING'
  | 'CAPTURED'
  | 'SUPPRESSED'
  | 'REVIEW_REQUIRED';
export interface DeliveryRecord {
  id: string;
  notificationId: string;
  ownerUserId: string;
  deviceId: string;
  deviceGeneration: number;
  status: DeliveryStatus;
  attempts: number;
  availableAt: Date;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}
export interface DeliveryWork {
  delivery: DeliveryRecord;
  device: DeviceRecord;
  leaseToken: string;
}
export const deviceView = (d: DeviceRecord) => ({
  id: d.id,
  platform: d.platform,
  provider: d.provider,
  generation: d.generation,
  expiresAt: d.expiresAt.toISOString(),
  revokedAt: d.revokedAt?.toISOString() ?? null,
});
export const inboxView = (n: InboxRecord) => ({
  id: n.id,
  type: 'ACTIVITY' as const,
  text: 'You have new activity. Open Zipp to view it.' as const,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});
