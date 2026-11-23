import { BusinessError } from '../../../shared/errors/business-error.js';
import type { RideRecord, RideState } from '../contracts/ride-contracts.js';
export const terminal = (state: RideState) =>
  ['COMPLETED', 'CANCELLED', 'NO_DRIVER'].includes(state);
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const r = (n: number) => (n * Math.PI) / 180;
  const value =
    Math.sin(r(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(r(a.latitude)) *
      Math.cos(r(b.latitude)) *
      Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(
      Math.sqrt(Math.min(1, Math.max(0, value))),
      Math.sqrt(Math.max(0, 1 - value)),
    )
  );
}
export function areaBounds(snapshot: unknown) {
  if (typeof snapshot !== 'object' || snapshot === null)
    throw new Error('Invalid persisted service area snapshot');
  const values = [
    'minimumLatitude',
    'maximumLatitude',
    'minimumLongitude',
    'maximumLongitude',
  ] as const;
  const data = Object.fromEntries(
    values.map((key) => [key, Reflect.get(snapshot, key)]),
  );
  if (
    values.some(
      (key) => typeof data[key] !== 'number' || !Number.isFinite(data[key]),
    )
  )
    throw new Error('Invalid persisted service area bounds');
  return {
    minimumLatitude: Number(data['minimumLatitude']),
    maximumLatitude: Number(data['maximumLatitude']),
    minimumLongitude: Number(data['minimumLongitude']),
    maximumLongitude: Number(data['maximumLongitude']),
  };
}
export function insideArea(
  ride: RideRecord,
  point: { latitude: number; longitude: number },
) {
  const area = areaBounds(ride.serviceAreaSnapshot);
  return (
    point.latitude >= area.minimumLatitude &&
    point.latitude <= area.maximumLatitude &&
    point.longitude >= area.minimumLongitude &&
    point.longitude <= area.maximumLongitude
  );
}
export function assertParticipant(ride: RideRecord, userId: string) {
  if (ride.customerUserId !== userId && ride.driverUserId !== userId)
    throw new BusinessError('NOT_FOUND', 'Ride not found');
}
export function assertDriver(ride: RideRecord, userId: string) {
  if (ride.driverUserId !== userId)
    throw new BusinessError('NOT_FOUND', 'Assigned ride not found');
}
export const radiusForWave = (wave: number) =>
  [2000, 5000, 10000][Math.min(2, Math.max(0, wave))] ?? 10000;
