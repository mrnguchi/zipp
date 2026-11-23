import { BusinessError } from '../../../shared/errors/business-error.js';
import type { PresenceRecord } from '../contracts/driver-contracts.js';
import type { LocationInput } from '../contracts/driver.schemas.js';
/** Geometry here detects implausible observations; it never computes a road fare. */
export function assertPlausibleLocation(
  previous: PresenceRecord,
  input: LocationInput,
): void {
  if (
    !previous.capturedAt ||
    previous.latitude === null ||
    previous.longitude === null
  )
    return;
  const elapsed =
    (Date.parse(input.capturedAt) - previous.capturedAt.getTime()) / 1000;
  if (elapsed <= 0)
    throw new BusinessError(
      'STALE_LOCATION',
      'Location capture time is not newer',
    );
  const radians = (value: number) => (value * Math.PI) / 180;
  const lat = radians(input.latitude - previous.latitude),
    lon = radians(input.longitude - previous.longitude);
  const a =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(previous.latitude)) *
      Math.cos(radians(input.latitude)) *
      Math.sin(lon / 2) ** 2;
  const meters =
    6371000 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
  if (meters > elapsed * 70 + 200)
    throw new BusinessError(
      'LOCATION_JUMP_REJECTED',
      'Location movement requires a fresh accurate observation',
    );
}
