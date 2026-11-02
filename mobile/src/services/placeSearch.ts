import { BUEA_CENTER } from '../components/maps/mapGeometry';
import type { MapCoordinate } from '../components/maps/mapGeometry';

export type PlaceSuggestion = { id: string; title: string; subtitle: string; label: string; coordinate: MapCoordinate };
const endpoint = process.env.EXPO_PUBLIC_PLACE_SEARCH_URL || 'https://photon.komoot.io/api/';
const cache = new Map<string, { time: number; places: PlaceSuggestion[] }>();

export function parsePlaceSuggestions(data: unknown): PlaceSuggestion[] {
  if (!data || typeof data !== 'object' || !('features' in data) || !Array.isArray(data.features)) throw new Error('Invalid search response');
  const places: PlaceSuggestion[] = [];
  for (const feature of data.features) {
    const properties = feature?.properties;
    const point = feature?.geometry;
    if (!properties || point?.type !== 'Point' || !Array.isArray(point.coordinates)) continue;
    const [longitude, latitude] = point.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    if (typeof properties.countrycode === 'string' && properties.countrycode.toUpperCase() !== 'CM') continue;
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const street = [text(properties.housenumber), text(properties.street)].filter(Boolean).join(' ');
    const title = text(properties.name) || street || text(properties.city);
    if (!title) continue;
    const subtitle = [...new Set([street, text(properties.district), text(properties.city), text(properties.state)].filter(value => value && value !== title))].join(', ');
    const id = `${longitude},${latitude}:${title}`;
    if (places.some(place => place.id === id)) continue;
    places.push({ id, title, subtitle, label: [title, subtitle].filter(Boolean).join(', '), coordinate: { latitude, longitude } });
  }
  return places.slice(0, 6);
}

export async function searchPlaces(query: string, signal: AbortSignal): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const key = trimmed.toLowerCase();
  const previous = cache.get(key);
  if (previous && Date.now() - previous.time < 300000) return previous.places;
  // Bias towards Buea without sending the device's precise location to search.
  const url = `${endpoint.replace(/\/+$/, '')}/?q=${encodeURIComponent(trimmed)}&lat=${BUEA_CENTER.latitude}&lon=${BUEA_CENTER.longitude}&bbox=8.4,1.6,16.3,13.1&limit=6&lang=en`;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Place search unavailable');
  const places = parsePlaceSuggestions(await response.json());
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  cache.set(key, { time: Date.now(), places });
  return places;
}

export async function reversePlace(point: MapCoordinate, signal: AbortSignal): Promise<string | undefined> {
  const reverseEndpoint = endpoint.replace(/\/+$/, '').replace(/\/api$/, '/reverse');
  const response = await fetch(`${reverseEndpoint}?lat=${point.latitude}&lon=${point.longitude}&limit=1&radius=0.3&lang=en`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Location lookup unavailable');
  return parsePlaceSuggestions(await response.json())[0]?.label;
}
