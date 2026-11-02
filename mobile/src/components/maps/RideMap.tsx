import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from '../AppText';
import { colors } from '../../constants/colors';
import { createMapDocument } from './mapDocument';
import type { MapCoordinate } from './mapGeometry';

type RideMapProps = {
  pickup?: MapCoordinate;
  destination?: MapCoordinate;
  route?: MapCoordinate[];
  drivers?: { id: string; coordinate: MapCoordinate; arrivalLabel?: string }[];
  driverRoute?: MapCoordinate[];
  cameraCoordinates?: MapCoordinate[];
  bottomInset: number;
  attributionBottomInset?: number;
  overlayTranslateY?: Animated.Value;
  cameraBottomInset?: number;
  locationFocus?: { coordinate: MapCoordinate; requestId: number };
  topInset: number;
  onSelectCoordinate?: (coordinate: MapCoordinate) => void;
  interactive?: boolean;
  showControls?: boolean;
  routeColor?: string;
};

export function RideMap({ pickup, destination, route, drivers, driverRoute, cameraCoordinates, bottomInset, attributionBottomInset = bottomInset, overlayTranslateY, cameraBottomInset = 0, locationFocus, topInset, onSelectCoordinate, interactive = true, showControls = true, routeColor = colors.primary }: RideMapProps) {
  const webView = useRef<WebView<object>>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const source = useMemo(() => ({ html: createMapDocument(), baseUrl: 'https://tiles.openfreemap.org/' }), []);
  const payload = JSON.stringify({ pickup, destination, route, drivers, driverRoute, cameraCoordinates, topInset, cameraBottomInset, locationFocus, interactive, routeColor });
  useEffect(() => {
    if (ready) webView.current?.injectJavaScript(`window.updateZippMap(${payload});true;`);
  }, [payload, ready]);
  useEffect(() => {
    if (loaded) return;
    const timeout = setTimeout(() => setFailed(true), 20000);
    return () => clearTimeout(timeout);
  }, [attempt, loaded]);
  const retry = () => { setReady(false); setLoaded(false); setFailed(false); setAttempt(value => value + 1); };
  const command = (value: string) => webView.current?.injectJavaScript(`window.zippMapCommand&&window.zippMapCommand(${JSON.stringify(value)});true;`);

  return <View style={styles.fill}>
    {/* Keep a real native, non-scrollable first child. UIKit otherwise discovers
        WKWebView's scroll view through flattened wrappers and can apply its
        status-bar scroll treatment to this full-screen background. */}
    <View collapsable={false} pointerEvents="none" style={styles.nativeInsetGuard} />
    <View collapsable={false} style={[styles.fill, { bottom: bottomInset }]}>
      <WebView<object> key={attempt} ref={webView} source={source} style={styles.webview}
        containerStyle={styles.fill}
        originWhitelist={['*']} javaScriptEnabled scrollEnabled={false} bounces={false}
        contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
        contentInset={{ top: 0, right: 0, bottom: 0, left: 0 }}
        automaticallyAdjustsScrollIndicatorInsets={false}
        onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://tiles.openfreemap.org/'}
        onError={() => setFailed(true)} onContentProcessDidTerminate={retry}
        onMessage={event => {
          try {
            const message = JSON.parse(event.nativeEvent.data);
            if (message.type === 'ready') setReady(true);
            if (message.type === 'loaded') { setLoaded(true); setFailed(false); }
            if (message.type === 'error') setFailed(true);
            if (message.type === 'select' && Number.isFinite(message.coordinate?.latitude) && Number.isFinite(message.coordinate?.longitude)) onSelectCoordinate?.(message.coordinate);
          } catch { /* Ignore malformed bridge messages. */ }
        }} />
      {!loaded && !failed && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.statusText}>Loading map…</Text></View>}
    </View>
    {showControls && <View style={[styles.controls, { top: topInset + 72 }]}>
      {([['add', 'Zoom in', 'in'], ['remove', 'Zoom out', 'out'], ['locate-outline', 'Recenter map', 'center']] as const).map(([icon, label, value]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} onPress={() => command(value)} style={styles.control}><Ionicons name={icon} size={20} color={colors.primary} /></Pressable>)}
    </View>}
    {failed && <Pressable accessibilityRole="button" onPress={retry} style={[styles.error, { top: topInset + 24 }]}><Text style={styles.statusText}>Map unavailable. Tap to retry.</Text></Pressable>}
    <Animated.View style={[styles.attribution, { bottom: attributionBottomInset + 6 }, overlayTranslateY && { transform: [{ translateY: overlayTranslateY }] }]}>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://openfreemap.org/')}><Text style={styles.attributionText}>OpenFreeMap</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://openmaptiles.org/')}><Text style={styles.attributionText}>© OpenMapTiles</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}><Text style={styles.attributionText}>© OpenStreetMap</Text></Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#FAFAFA' },
  nativeInsetGuard: { position: 'absolute', top: 0, left: 0, width: 1, height: 1 },
  webview: { flex: 1, backgroundColor: '#FAFAFA' },
  loading: { position: 'absolute', top: '50%', alignSelf: 'center', alignItems: 'center', gap: 8 },
  controls: { position: 'absolute', right: 20, gap: 8 },
  control: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  attribution: { position: 'absolute', left: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 4, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 4 },
  attributionText: { fontSize: 8, color: '#666666' },
  error: { position: 'absolute', left: 20, right: 74, padding: 10, borderRadius: 12, backgroundColor: colors.white },
  statusText: { fontSize: 11, color: colors.secondaryText },
});
