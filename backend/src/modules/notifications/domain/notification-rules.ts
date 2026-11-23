import type {
  DeviceRecord,
  DeliveryRecord,
} from '../contracts/notification-records.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
export const deviceCurrent = (d: DeviceRecord, now: Date) =>
  !d.revokedAt && d.expiresAt > now && !!d.tokenCiphertext;
export function assertGeneration(actual: number, expected: number) {
  if (actual !== expected)
    throw new BusinessError(
      'DEVICE_VERSION_CONFLICT',
      'Reload the current device registration',
    );
  if (actual >= 1000000)
    throw new BusinessError(
      'DEVICE_VERSION_LIMIT',
      'Create a new installation identity',
    );
}
export function ownsDeliveryLease(d: DeliveryRecord, token: string, now: Date) {
  return (
    d.status === 'PENDING' &&
    d.leaseToken === token &&
    !!d.leaseExpiresAt &&
    d.leaseExpiresAt > now
  );
}
export function retryDelayMs(attempt: number, jitter: number) {
  return (
    Math.min(300000, 1000 * 2 ** Math.min(attempt, 8)) +
    Math.max(0, Math.min(999, Math.floor(jitter)))
  );
}
