export const notificationEvents = [
  { key: 'arrived', label: 'Driver arrival', kind: 'ride' },
  { key: 'started', label: 'Ride started', kind: 'ride' },
  { key: 'canceled', label: 'Ride canceled', kind: 'ride' },
  { key: 'payment_failed', label: 'Payment needs attention', kind: 'ride' },
  { key: 'payment_received', label: 'Ride receipt', kind: 'wallet' },
  { key: 'wallet_deposit', label: 'Wallet deposit', kind: 'wallet' },
  { key: 'info', label: 'Zipp announcements', kind: 'info' },
] as const;
export type NotificationEventKey = typeof notificationEvents[number]['key'];
export const soundOptions = [
  { id: 'chime', label: 'Chime' },
  { id: 'bell', label: 'Bell' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'silent', label: 'Silent' },
] as const;
export type NotificationSound = typeof soundOptions[number]['id'];
export type NotificationSounds = Record<NotificationEventKey, NotificationSound>;
export const defaultNotificationSounds: NotificationSounds = { arrived: 'chime', started: 'chime', canceled: 'pulse', payment_failed: 'pulse', payment_received: 'bell', wallet_deposit: 'bell', info: 'chime' };
export function resolveNotificationSound(sounds: NotificationSounds, event: NotificationEventKey | undefined, kind: 'ride' | 'wallet' | 'info'): NotificationSound {
  return sounds[event ?? (kind === 'wallet' ? 'wallet_deposit' : kind === 'ride' ? 'arrived' : 'info')];
}
