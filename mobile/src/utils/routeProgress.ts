import type { MapCoordinate } from '../components/maps/mapGeometry';
// Clockwise from north, matching the north-up map and car artwork.
function segmentHeading(start: MapCoordinate, end: MapCoordinate) {
  return (Math.atan2((end.longitude - start.longitude) * Math.cos((start.latitude + end.latitude) * Math.PI / 360), end.latitude - start.latitude) * 180 / Math.PI + 360) % 360;
}

export function routeProgress(points: MapCoordinate[], progress: number): { coordinate?: MapCoordinate; heading?: number; remaining: MapCoordinate[] } {
  if (!points.length) return { remaining: [] };
  if (points.length === 1) return { coordinate: points[0], remaining: points };
  const fraction = Math.max(0, Math.min(1, progress));
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    return Math.hypot((point.longitude - previous.longitude) * Math.cos((point.latitude + previous.latitude) * Math.PI / 360), point.latitude - previous.latitude);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return { coordinate: points[0], remaining: [points[0]] };
  if (fraction === 1) {
    const lastSegment = lengths.findLastIndex(length => length > 0);
    return { coordinate: points[points.length - 1], heading: segmentHeading(points[lastSegment], points[lastSegment + 1]), remaining: [points[points.length - 1]] };
  }
  let target = total * fraction;
  for (let index = 0; index < lengths.length; index++) {
    if (lengths[index] === 0) continue;
    if (target < lengths[index] || index === lengths.length - 1) {
      const part = lengths[index] ? target / lengths[index] : 0;
      const start = points[index], end = points[index + 1];
      const coordinate = { latitude: start.latitude + (end.latitude - start.latitude) * part, longitude: start.longitude + (end.longitude - start.longitude) * part };
      return { coordinate, heading: segmentHeading(start, end), remaining: [coordinate, ...points.slice(index + 1)] };
    }
    target -= lengths[index];
  }
  return { coordinate: points[0], remaining: points };
}
