import {KeyboardAwareScrollView as ScrollView} from '../components/KeyboardAwareScrollView';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from '../components/LocalizedNative';
import { useEffect, useRef, useState } from 'react';
import {ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, View} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { RideMap } from '../components/maps/RideMap';
import type { MapCoordinate } from '../components/maps/mapGeometry';
import { colors } from '../constants/colors';
import { useSavedPlaces } from '../contexts/SavedPlacesContext';
import type { SavedPlace } from '../contexts/SavedPlacesContext';
import { usePlaceSuggestions } from '../hooks/usePlaceSuggestions';
import { useMyLocation } from '../hooks/useMyLocation';
import { reversePlace } from '../services/placeSearch';
import type { RootStackParamList } from '../navigation/types';

export function SavedPlacesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SavedPlaces'>>();
  const insets = useSafeAreaInsets();
  const saved = useSavedPlaces();
  const [editing, setEditing] = useState(Boolean(params?.kind || params?.location));
  const [id, setId] = useState<string>();
  const [kind, setKind] = useState<SavedPlace['kind']>(params?.kind || 'other');
  const [name, setName] = useState('');
  const [query, setQuery] = useState(params?.location?.label || '');
  const [point, setPoint] = useState<MapCoordinate | undefined>(params?.location?.coordinate);
  const [mapOpen, setMapOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SavedPlace | null>(null);
  const [lookup, setLookup] = useState(false);
  const [error, setError] = useState('');
  const results = usePlaceSuggestions(query, editing && !mapOpen && !point);
  const { locate, locating, locationFocus } = useMyLocation();
  const awaitingGps = useRef(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!saved.ready || initialized.current) return;
    initialized.current = true;
    const location = params?.location;
    const existing = location ? saved.places.find(place => Math.abs(place.coordinate.latitude - location.coordinate.latitude) < 0.00001 && Math.abs(place.coordinate.longitude - location.coordinate.longitude) < 0.00001) : undefined;
    if (existing) { setId(existing.id); setKind(existing.kind); setName(existing.name); setQuery(existing.label); setPoint(existing.coordinate); }
  }, [saved.ready, saved.places, params?.location]);
  useEffect(() => {
    if (locationFocus && awaitingGps.current) { awaitingGps.current = false; choosePoint(locationFocus.coordinate); }
  }, [locationFocus]);
  useEffect(() => {
    if (!point || !lookup) return;
    const controller = new AbortController();
    reversePlace(point, controller.signal).then(label => { if (!controller.signal.aborted && label) setQuery(label); }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLookup(false); });
    return () => controller.abort();
  }, [point, lookup]);
  function choosePoint(coordinate: MapCoordinate) { setPoint(coordinate); setQuery(`${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`); setLookup(true); Keyboard.dismiss(); }
  function edit(place?: SavedPlace, shortcut: SavedPlace['kind'] = 'other') {
    setId(place?.id); setKind(place?.kind || shortcut); setName(place?.name || ''); setQuery(place?.label || ''); setPoint(place?.coordinate); setLookup(false); setError(''); setEditing(true);
  }
  async function save() {
    if (!point || !query.trim() || (kind === 'other' && !name.trim()) || saving) return;
    setSaving(true); Keyboard.dismiss();
    const ok = await saved.save({ id: id || `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, name: kind === 'home' ? 'Home' : kind === 'work' ? 'Work' : name.trim(), label: query.trim(), coordinate: point });
    setSaving(false);
    if (ok) { setEditing(false); if (params?.location) navigation.goBack(); }
    else setError('Could not save this place. Please try again.');
  }
  const header = (title: string, back: () => void) => <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.round}><Ionicons name="arrow-back" size={22} color={colors.navy} /></Pressable><Text translate style={styles.title}>{title}</Text></View>;
  if (mapOpen) return <View style={styles.screen}>
    <RideMap destination={point} locationFocus={locationFocus} bottomInset={0} cameraBottomInset={235 + insets.bottom} attributionBottomInset={235 + insets.bottom} topInset={insets.top + 20} onSelectCoordinate={choosePoint} showControls={false} />
    <View style={[styles.mapHeader, { top: insets.top + 12 }]}><Pressable accessibilityRole="button" accessibilityLabel="Close map selection" onPress={() => setMapOpen(false)} style={styles.round}><Ionicons name="close" size={24} color={colors.navy} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Use my current location" accessibilityState={{busy:locating,disabled:locating}} disabled={locating} onPress={() => { Keyboard.dismiss(); awaitingGps.current = true; void locate(); }} style={styles.round}>{locating ? <ActivityIndicator size="small" color={colors.primary}/> : <Image source={require('../../assets/current-location.png')} style={styles.icon} resizeMode="contain" />}</Pressable></View>
    <View style={[styles.mapCard, { bottom: Math.max(insets.bottom, 16) }]}><Text translate style={styles.heading}>Choose your place</Text><Text translate style={styles.copy}>Tap the map to position your pin.</Text><View style={styles.address}><Image source={require('../../assets/location.png')} style={styles.icon} resizeMode="contain" /><Text translate style={[styles.copy, styles.flex]} numberOfLines={2}>{lookup ? 'Finding address…' : query || 'Select a location on the map'}</Text></View><ActionButton accessibilityLabel="Use this location" disabled={!point || lookup} onPress={() => setMapOpen(false)}>Use this location</ActionButton></View>
  </View>;
  return <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    {header(editing ? id ? 'Edit place' : 'Save a place' : 'Saved places', () => editing ? setEditing(false) : navigation.goBack())}
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
      {Boolean(saved.error || error) && <Text translate accessibilityLiveRegion="polite" style={styles.error}>{error || saved.error}</Text>}
      {!saved.ready && !saved.error && <ActivityIndicator color={colors.primary} />}
      {editing ? <>
        <Text translate style={styles.heading}>Keep your favourite places close</Text><Text translate style={styles.copy}>Save a precise location for quicker rides and deliveries.</Text>
        <View style={styles.row}>{(['home', 'work', 'other'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value} accessibilityState={{ checked: kind === value }} onPress={() => setKind(value)} style={[styles.chip, kind === value && styles.selected]}><Ionicons name={value === 'home' ? 'home-outline' : value === 'work' ? 'briefcase-outline' : 'bookmark-outline'} size={20} color={colors.navy} /><Text translate style={styles.name}>{value === 'home' ? 'Home' : value === 'work' ? 'Work' : 'Other'}</Text></Pressable>)}</View>
        {kind === 'other' && <View style={styles.group}><Text translate style={styles.name}>Place name</Text><TextInput accessibilityLabel="Saved place name" value={name} onChangeText={setName} placeholder="e.g. Gym or Mum’s house" placeholderTextColor={colors.secondaryText} style={styles.input} maxLength={40} /></View>}
        <View style={styles.group}><Text translate style={styles.name}>Address or landmark</Text><TextInput accessibilityLabel="Search saved place address" value={query} onChangeText={value => { setQuery(value); setPoint(undefined); setLookup(false); }} placeholder="Search for a place" placeholderTextColor={colors.secondaryText} style={styles.input} maxLength={200} /></View>
        {results.status === 'loading' && <ActivityIndicator color={colors.primary} />}
        {results.status === 'error' && <Pressable accessibilityRole="button" onPress={results.retry}><Text translate style={styles.error}>Could not load suggestions. Tap to retry.</Text></Pressable>}
        {results.status === 'ready' && !results.places.length && !point && <Text translate style={styles.copy}>No matches. Try a nearby landmark or choose on the map.</Text>}
        {results.places.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => { setPoint(place.coordinate); setQuery(place.label); setLookup(false); Keyboard.dismiss(); }} style={styles.address}><Image source={require('../../assets/location.png')} style={styles.icon} resizeMode="contain" /><View style={styles.flex}><Text translate style={styles.name}>{place.title}</Text><Text translate style={styles.copy}>{place.subtitle}</Text></View></Pressable>)}
        {results.places.length > 0 && <Text translate style={styles.credit}>Photon · © OpenStreetMap contributors</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Use my current location" accessibilityState={{busy:locating,disabled:locating}} disabled={locating} onPress={() => { Keyboard.dismiss(); awaitingGps.current = true; void locate(); }} style={styles.address}><Image source={require('../../assets/current-location.png')} style={styles.icon} resizeMode="contain" /><Text translate style={[styles.name,{flex:1}]}>{locating ? 'Finding your location…' : 'Use my current location'}</Text>{locating&&<ActivityIndicator accessibilityLabel="Finding your location" size="small" color={colors.primary}/>}</Pressable>
        <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setMapOpen(true); }} style={styles.address}><Image source={require('../../assets/map-icon.png')} style={styles.icon} resizeMode="contain" /><Text translate style={styles.name}>Choose on map</Text></Pressable>
        {point && <View style={styles.confirmed}><Ionicons name="checkmark-circle" size={20} color={colors.primary} /><Text translate style={[styles.copy, styles.flex]}>{lookup ? 'Finding address…' : query}</Text></View>}
      </> : <>
        <Text translate style={styles.copy}>Your everyday stops, ready whenever you are.</Text>
        {(['home', 'work'] as const).map(shortcut => {
          const place = saved.places.find(item => item.kind === shortcut);
          return <View key={shortcut} style={styles.placeRow}><Pressable disabled={!saved.ready} accessibilityRole="button" onPress={() => place ? navigation.navigate('BookRide', { destinationLabel: place.label, destinationCoordinate: place.coordinate }) : edit(undefined, shortcut)} style={styles.placeMain}><View style={styles.placeIcon}><Ionicons name={shortcut === 'home' ? 'home' : 'briefcase'} size={23} color={colors.primary} /></View><View style={styles.flex}><Text translate style={styles.name}>{shortcut === 'home' ? 'Home' : 'Work'}</Text><Text  style={styles.copy} numberOfLines={2}>{place?.label || `Add ${shortcut} address`}</Text></View></Pressable><Pressable disabled={!saved.ready} accessibilityRole="button" accessibilityLabel={place ? `Edit ${place.name}` : `Add ${shortcut}`} onPress={() => edit(place, shortcut)} style={styles.round}><Ionicons name={place ? 'create-outline' : 'add'} size={22} color={place ? colors.primary : colors.yellow} /></Pressable>{place && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${place.name}`} onPress={() => setDeleting(place)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.secondaryText} /></Pressable>}</View>;
        })}
        <Text translate style={styles.heading}>Other places</Text>
        {saved.places.filter(place => place.kind === 'other').map(place => <View key={place.id} style={styles.placeRow}><Pressable accessibilityRole="button" onPress={() => navigation.navigate('BookRide', { destinationLabel: place.label, destinationCoordinate: place.coordinate })} style={styles.placeMain}><Image source={require('../../assets/save-location.png')} style={styles.icon} resizeMode="contain" /><View style={styles.flex}><Text  style={styles.name}>{place.name}</Text><Text style={styles.copy} numberOfLines={2}>{place.label}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${place.name}`} onPress={() => edit(place)} style={styles.round}><Ionicons name="create-outline" size={21} color={colors.primary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Remove ${place.name}`} onPress={() => setDeleting(place)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={colors.secondaryText} /></Pressable></View>)}
        {!saved.places.some(place => place.kind === 'other') && <View style={styles.address}><Text translate style={styles.copy}>Save your favourite shops, family addresses, and places you visit often.</Text></View>}
      </>}
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: insets.bottom + 16, flexShrink: 0 }]}><ActionButton arrow={editing ? 'arrow-forward' : 'add'} accessibilityLabel={editing ? 'Save place' : 'Add a place'} disabled={!saved.ready || saving || (editing && (!point || lookup || (kind === 'other' && !name.trim())))} onPress={() => editing ? void save() : edit()}>{saving ? 'Saving…' : editing ? 'Save place' : 'Add a place'}</ActionButton></View>
    <Modal transparent visible={Boolean(deleting)} animationType="fade" onRequestClose={() => setDeleting(null)}><View style={styles.modalRoot}><Pressable accessibilityRole="button" accessibilityLabel="Keep saved place" onPress={() => setDeleting(null)} style={styles.backdrop} /><View style={styles.dialog}><Text translate style={styles.heading}>Remove {deleting?.name}?</Text><Text translate style={styles.copy}>This removes the shortcut from your saved places.</Text><ActionButton accessibilityLabel="Keep place" onPress={() => setDeleting(null)}>Keep place</ActionButton><Pressable accessibilityRole="button" disabled={saving} onPress={async () => { if (!deleting) return; setSaving(true); const ok = await saved.remove(deleting.id); setSaving(false); if (ok) setDeleting(null); }} style={styles.delete}><Text translate style={styles.error}>{saving ? 'Removing…' : 'Remove place'}</Text></Pressable></View></View></Modal>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white }, header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13 }, title: { fontSize: 24, fontWeight: '600', color: colors.navy }, heading: { fontSize: 19, fontWeight: '600', color: colors.navy }, round: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' }, body: { padding: 24, gap: 16 }, row: { flexDirection: 'row', gap: 10 }, chip: { flex: 1, minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.input, borderRadius: 16 }, selected: { backgroundColor: colors.yellow }, name: { fontSize: 13, fontWeight: '600', color: colors.navy }, copy: { fontSize: 12, lineHeight: 20, color: colors.secondaryText }, group: { gap: 8 }, input: { minHeight: 58, backgroundColor: colors.input, borderRadius: 16, padding: 16, fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.navy }, flex: { flex: 1 }, address: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.input, padding: 16, borderRadius: 16, minHeight: 60 }, icon: { width: 26, height: 26 }, confirmed: { flexDirection: 'row', alignItems: 'center', gap: 9 }, footer: { paddingHorizontal: 24, paddingTop: 10 }, placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: colors.input, borderRadius: 17, minHeight: 90 }, placeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, placeIcon: { backgroundColor: colors.white, width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, credit: { fontSize: 10, color: colors.secondaryText }, error: { fontSize: 13, color: colors.error }, mapHeader: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }, mapCard: { position: 'absolute', left: 20, right: 20, backgroundColor: colors.white, borderRadius: 24, padding: 20, gap: 12 }, modalRoot: { flex: 1, padding: 24, justifyContent: 'center' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,27,38,0.45)' }, dialog: { padding: 24, backgroundColor: colors.white, borderRadius: 24, gap: 18 }, delete: { padding: 14, alignItems: 'center' },
});
