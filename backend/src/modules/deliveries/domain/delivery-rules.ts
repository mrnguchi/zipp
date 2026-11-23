import { BusinessError } from '../../../shared/errors/business-error.js';
import type {
  DeliveryRecord,
  DeliveryState,
} from '../contracts/delivery-contracts.js';
export const deliveryTerminal = (state: DeliveryState) =>
  ['DELIVERED', 'RETURNED', 'CANCELLED', 'NO_COURIER'].includes(state);
export const hasParticipant = (d: DeliveryRecord, id: string) =>
  [d.bookerUserId, d.senderUserId, d.recipientUserId, d.courierUserId].includes(
    id,
  );
export function assertDeliveryParticipant(d: DeliveryRecord, id: string) {
  if (!hasParticipant(d, id))
    throw new BusinessError('NOT_FOUND', 'Delivery not found');
}
export function assertPackageWeight(size: string, weight: number) {
  const maximum = size === 'SMALL' ? 2000 : size === 'MEDIUM' ? 10000 : 20000;
  if (weight < 1 || weight > maximum)
    throw new BusinessError(
      'VALIDATION_ERROR',
      'Declared package weight exceeds its size limit',
    );
}
export const deliveryRadius = (wave: number) =>
  [2000, 5000, 10000][Math.min(2, Math.max(0, wave))] ?? 10000;
export function proximityMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = (v: number) => (v * Math.PI) / 180,
    v =
      Math.sin(r(b.latitude - a.latitude) / 2) ** 2 +
      Math.cos(r(a.latitude)) *
        Math.cos(r(b.latitude)) *
        Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(
      Math.sqrt(Math.min(1, Math.max(0, v))),
      Math.sqrt(Math.max(0, 1 - v)),
    )
  );
}
export function inDeliveryArea(
  d: DeliveryRecord,
  p: { latitude: number; longitude: number },
) {
  const a = d.serviceAreaSnapshot;
  if (!a || typeof a !== 'object') throw new Error('Invalid persisted area');
  const values = [
    'minimumLatitude',
    'maximumLatitude',
    'minimumLongitude',
    'maximumLongitude',
  ].map((k): unknown => Reflect.get(a, k));
  if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
    throw new Error('Invalid persisted area bounds');
  return (
    p.latitude >= Number(values[0]) &&
    p.latitude <= Number(values[1]) &&
    p.longitude >= Number(values[2]) &&
    p.longitude <= Number(values[3])
  );
}
