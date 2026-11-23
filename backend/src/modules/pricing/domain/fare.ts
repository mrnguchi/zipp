import { BusinessError } from '../../../shared/errors/business-error.js';
import type {
  AreaRecord,
  PolicyRecord,
} from '../contracts/pricing-contracts.js';
export function withinArea(
  area: AreaRecord,
  point: { latitude: number; longitude: number },
): boolean {
  return (
    point.latitude >= area.minimumLatitude &&
    point.latitude <= area.maximumLatitude &&
    point.longitude >= area.minimumLongitude &&
    point.longitude <= area.maximumLongitude
  );
}
const ceil = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator - 1n) / denominator;
export function fareForRoute(
  policy: PolicyRecord,
  distanceMeters: number,
  durationSeconds: number,
  instant: Date,
) {
  if (
    !Number.isInteger(distanceMeters) ||
    distanceMeters <= 0 ||
    distanceMeters > 200000 ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > 43200
  )
    throw new BusinessError(
      'ROUTE_NOT_AVAILABLE',
      'Route exceeds supported limits',
    );
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Douala',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(instant),
  );
  const night = hour >= 22 || hour < 6;
  const routeAmount =
    policy.baseFareXaf +
    ceil(BigInt(distanceMeters) * policy.perKilometerXaf, 1000n) +
    ceil(BigInt(durationSeconds) * policy.perMinuteXaf, 60n);
  const minimumAdjusted =
    routeAmount > policy.minimumFareXaf ? routeAmount : policy.minimumFareXaf;
  const totalAmountXaf = ceil(
    minimumAdjusted * BigInt(night ? policy.nightMultiplierBps : 10000),
    10000n,
  );
  if (totalAmountXaf <= 0n || totalAmountXaf > 1_000_000_000n)
    throw new BusinessError(
      'ROUTE_NOT_AVAILABLE',
      'Fare exceeds supported limits',
    );
  return {
    totalAmountXaf,
    night,
    commissionBps: policy.commissionBps,
    cancellationFeeXaf: policy.cancellationFeeXaf.toString(),
  };
}
