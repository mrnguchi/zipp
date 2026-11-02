import { useEffect } from 'react';
import type { MapCoordinate } from '../components/maps/mapGeometry';
import { reversePlace } from '../services/placeSearch';
export function usePickupAddress(coordinate: MapCoordinate | undefined, resolve: boolean, onResolved: (point: MapCoordinate, label: string) => void) {
  useEffect(() => {
    if (!coordinate || !resolve) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    void reversePlace(coordinate, controller.signal).then(label => {
      if (active && label) onResolved(coordinate, label);
    }).catch(() => { /* The precise coordinates remain the location fallback. */ }).finally(() => clearTimeout(timeout));
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [coordinate?.latitude, coordinate?.longitude, resolve]);
}
