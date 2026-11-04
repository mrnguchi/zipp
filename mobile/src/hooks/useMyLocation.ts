import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import type { MapCoordinate } from '../components/maps/mapGeometry';
import { getPreciseLocation } from '../services/preciseLocation';

export function useMyLocation() {
  const [locating, setLocating] = useState(false);
  const [locationFocus, setLocationFocus] = useState<{ coordinate: MapCoordinate; requestId: number; accuracy: number | null }>();
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const locate = async () => {
    if (pending.current) return;
    pending.current = true;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current) return;
      if (!permission.granted) {
        Alert.alert('Allow location access', 'Enable location access to show your position on the map.', permission.canAskAgain ? [{ text: 'OK' }] : [
          { text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => { void Linking.openSettings(); } },
        ]);
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert('Location is turned off', 'Turn on location services on your phone, then tap My location again.');
        return;
      }
      if (!mounted.current) return;
      request.current = new AbortController();
      const location = await getPreciseLocation(request.current.signal);
      if (mounted.current) {
        const focus = { coordinate: { latitude: location.coords.latitude, longitude: location.coords.longitude }, requestId: Date.now(), accuracy: location.coords.accuracy };
        setLocationFocus(focus);
        return focus;
      }
    } catch {
      if (mounted.current) Alert.alert('Location unavailable', 'Your phone has not returned a location yet. Try again or choose your pickup on the map.');
    } finally {
      pending.current = false;
      if (mounted.current) setLocating(false);
    }
  };
  return { locating, locationFocus, locate };
}
