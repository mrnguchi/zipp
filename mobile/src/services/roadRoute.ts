import type { MapCoordinate } from '../components/maps/mapGeometry';

export type RoadRoute = { coordinates: MapCoordinate[]; distanceMeters: number; durationSeconds: number };
const endpoint = process.env.EXPO_PUBLIC_ROUTING_URL || 'https://router.project-osrm.org/route/v1/driving';
const cache = new Map<string, RoadRoute>();

export function validCoordinate(point: MapCoordinate): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

export function parseRoadRoute(data: unknown): RoadRoute {
  const body = data as { code?: string; routes?: { geometry?: { type?: string; coordinates?: unknown[] }; distance?: number; duration?: number }[] } | null;
  const route = body?.routes?.[0];
  if (body?.code !== 'Ok' || route?.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2) throw new Error('No road route found');
  const coordinates = route.geometry.coordinates.map(value => {
    if (!Array.isArray(value) || value.length < 2) throw new Error('Invalid route geometry');
    const point = { longitude: value[0], latitude: value[1] };
    if (!validCoordinate(point)) throw new Error('Invalid route geometry');
    return point;
  });
  if (typeof route.distance !== 'number' || !Number.isFinite(route.distance) || route.distance < 0 || typeof route.duration !== 'number' || !Number.isFinite(route.duration) || route.duration < 0) throw new Error('Invalid route summary');
  return { coordinates, distanceMeters: route.distance, durationSeconds: route.duration };
}

export async function fetchRoadRoute(pickup: MapCoordinate, destination: MapCoordinate, signal: AbortSignal): Promise<RoadRoute> {
  if (!validCoordinate(pickup) || !validCoordinate(destination)) throw new Error('Invalid route stops');
  const key = `${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const response = await fetch(`${endpoint.replace(/\/+$/, '')}/${key}?overview=full&geometries=geojson&steps=false&alternatives=false&radiuses=200;200`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Routing unavailable');
  const route = parseRoadRoute(await response.json());
  if (cache.size >= 20) cache.delete(cache.keys().next().value!);
  cache.set(key, route);
  return route;
}
