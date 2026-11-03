import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import type { MapCoordinate } from '../components/maps/mapGeometry';

export type SavedPlace = { id: string; name: string; kind: 'home' | 'work' | 'other'; label: string; coordinate: MapCoordinate };
export function validSavedPlace(value: unknown): value is SavedPlace {
  const place = value as SavedPlace | null;
  return Boolean(place && typeof place.id === 'string' && typeof place.name === 'string' && place.name.trim() && typeof place.label === 'string' && place.label.trim() && ['home', 'work', 'other'].includes(place.kind) && Number.isFinite(place.coordinate?.latitude) && Math.abs(place.coordinate.latitude) <= 90 && Number.isFinite(place.coordinate?.longitude) && Math.abs(place.coordinate.longitude) <= 180);
}
const Context = createContext<{ places: SavedPlace[]; ready: boolean; error: string; save: (place: SavedPlace) => Promise<boolean>; remove: (id: string) => Promise<boolean> } | null>(null);
export function SavedPlacesProvider({ children }: PropsWithChildren) {
  const { profile } = useProfile();
  const key = `zipp:saved-places:v1:${profile?.phone || 'guest'}`;
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef<SavedPlace[]>([]);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const version = ++generation.current;
    setReady(false); setPlaces([]); latest.current = []; setError('');
    AsyncStorage.getItem(key).then(value => {
      if (version !== generation.current) return;
      const parsed: unknown = value ? JSON.parse(value) : [];
      const loaded = Array.isArray(parsed) ? parsed.filter(validSavedPlace) : [];
      latest.current = loaded; setPlaces(loaded); setReady(true);
    }).catch(() => { if (version === generation.current) setError('Could not load saved places. Close and reopen the app to retry.'); });
    return () => { generation.current++; };
  }, [key]);
  async function commit(next: SavedPlace[]) {
    if (!ready || busy.current) return false;
    const version = generation.current;
    busy.current = true;
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
      if (version !== generation.current) return false;
      latest.current = next; setPlaces(next); setError(''); return true;
    } catch { if (version === generation.current) setError('Could not save your changes. Please try again.'); return false; }
    finally { busy.current = false; }
  }
  async function save(place: SavedPlace) {
    if (!validSavedPlace(place)) return false;
    const cleaned = { ...place, name: place.name.trim(), label: place.label.trim() };
    // Home and Work each have one shortcut; changing either updates that shortcut.
    return commit([...latest.current.filter(item => item.id !== place.id && (place.kind === 'other' || item.kind !== place.kind)), cleaned]);
  }
  return <Context.Provider value={{ places, ready, error, save, remove: id => commit(latest.current.filter(place => place.id !== id)) }}>{children}</Context.Provider>;
}
export function useSavedPlaces() { const value = useContext(Context); if (!value) throw new Error('SavedPlacesProvider required'); return value; }
