import { useEffect, useState } from 'react';
import type { MapCoordinate } from '../components/maps/mapGeometry';
import { fetchRoadRoute } from '../services/roadRoute';
import type { RoadRoute } from '../services/roadRoute';

type State = { key: string; status: 'idle' | 'loading' | 'ready' | 'error'; route?: RoadRoute };
export function useRoadRoute(pickup?: MapCoordinate, destination?: MapCoordinate) {
  const key = pickup && destination ? `${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}` : '';
  const [state, setState] = useState<State>({ key: '', status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!pickup || !destination) { setState({ key, status: 'idle' }); return; }
    const controller = new AbortController();
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setState({ key, status: 'loading' });
    const debounce = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const route = await fetchRoadRoute(pickup, destination, controller.signal);
        if (active) setState({ key, status: 'ready', route });
      } catch {
        if (active) setState({ key, status: 'error' });
      } finally { clearTimeout(timeout); }
    }, 400);
    return () => { active = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [key, attempt]);
  const current: State = !key ? { key, status: 'idle' } : state.key === key ? state : { key, status: 'loading' };
  return { ...current, retry: () => setAttempt(value => value + 1) };
}
