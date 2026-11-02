import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import type { MapCoordinate } from '../components/maps/mapGeometry';

export function useMyLocation() {
  const [locating, setLocating] = useState(false);
  const [locationFocus, setLocationFocus] = useState<{ coordinate: MapCoordinate; requestId: number }>();
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const locate = async () => {
    if (pending.current) return;
    pending.current = true;
    setLocating(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 18000); }),
      ]);
      if (mounted.current) setLocationFocus({ coordinate: { latitude: location.coords.latitude, longitude: location.coords.longitude }, requestId: Date.now() });
    } catch {
      if (mounted.current) Alert.alert('Could not find your location', 'Check your GPS signal and try again. You can still move the map manually.');
    } finally {
      if (timer) clearTimeout(timer);
      pending.current = false;
      if (mounted.current) setLocating(false);
    }
  };
  return { locating, locationFocus, locate };
}
