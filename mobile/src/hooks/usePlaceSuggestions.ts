import { useEffect, useState } from 'react';
import { searchPlaces } from '../services/placeSearch';
import type { PlaceSuggestion } from '../services/placeSearch';

type SearchState = { query: string; status: 'idle' | 'loading' | 'ready' | 'error'; places: PlaceSuggestion[] };
export function usePlaceSuggestions(value: string, enabled: boolean) {
  const query = value.trim();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState>({ query: '', status: 'idle', places: [] });
  useEffect(() => {
    if (!enabled || query.length < 3) { setState({ query, status: 'idle', places: [] }); return; }
    let active = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setState({ query, status: 'loading', places: [] });
    const debounce = setTimeout(async () => {
      timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const places = await searchPlaces(query, controller.signal);
        if (active) setState({ query, status: 'ready', places });
      } catch {
        if (active) setState({ query, status: 'error', places: [] });
      } finally { clearTimeout(timeout); }
    }, 450);
    return () => { active = false; clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [query, enabled, attempt]);
  const current: SearchState = !enabled || query.length < 3 ? { query, status: 'idle', places: [] } : state.query !== query ? { query, status: 'loading', places: [] } : state;
  return { ...current, retry: () => setAttempt(value => value + 1) };
}
