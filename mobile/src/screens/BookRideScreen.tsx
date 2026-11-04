import { inputStyles } from '../constants/inputStyles';
import {KeyboardAwareScrollView as ScrollView} from '../components/KeyboardAwareScrollView';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from '../components/LocalizedNative';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {ActivityIndicator, Animated, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Share, StyleSheet, View, useWindowDimensions} from 'react-native';
import { useNavigation, usePreventRemove, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { AppText as Text } from '../components/AppText';
import { RideDriverDetails } from '../components/RideDriverDetails';
import { CancelRideModal } from '../components/CancelRideModal';
import { RideCompletion } from '../components/RideCompletion';
import { RideSimulationControls } from '../components/RideSimulationControls';
import { RideMap } from '../components/maps/RideMap';
import type { MapCoordinate } from '../components/maps/mapGeometry';
import { colors } from '../constants/colors';
import { useHomeSheet } from '../hooks/useHomeSheet';
import { useMyLocation } from '../hooks/useMyLocation';
import { usePlaceSuggestions } from '../hooks/usePlaceSuggestions';
import { useRoadRoute } from '../hooks/useRoadRoute';
import type { RoadRoute } from '../services/roadRoute';
import { sampleDriverLocation } from '../utils/sampleDriverLocation';
import { routeProgress } from '../utils/routeProgress';
import { useRideLifecycle } from '../hooks/useRideLifecycle';
import { useArrivalSimulation } from '../hooks/useArrivalSimulation';
import { useWallet } from '../contexts/WalletContext';
import { useMessaging } from '../contexts/MessagingContext';
import { driverConversation } from '../services/messaging';
import { useSavedPlaces } from '../contexts/SavedPlacesContext';
import { usePickupAddress } from '../hooks/usePickupAddress';
import { formatXaf } from '../utils/formatCurrency';
import type { PlaceSuggestion } from '../services/placeSearch';
import type { RootStackParamList } from '../navigation/types';

// Preview distances and fares until driver availability and quotes are connected.
const rides = [
  { id: 'everyday', name: 'Everyday', distanceKm: '0.8', priceXaf: '1,500', seats: 4, image: require('../../assets/cars/toyota--yaris--2013.png') },
  { id: 'comfort', name: 'Comfort', distanceKm: '1.2', priceXaf: '2,000', seats: 4, image: require('../../assets/cars/lexus--rx-400h--2005-2011.png') },
  { id: 'premium', name: 'Premium', distanceKm: '1.6', priceXaf: '3,000', seats: 4, image: require('../../assets/cars/mercedes-benz--gle-amg-coupe--2020-2026--review.png') },
] as const;
type Stop = { label: string; coordinate?: MapCoordinate };
type StopKey = 'pickup' | 'destination';
type Panel = StopKey | 'safety' | 'events' | 'wallet' | null;

export function BookRideScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'BookRide'>>();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [screenHeight, setScreenHeight] = useState(height);
  const sheet = useHomeSheet(screenHeight, insets.top + 68, 0.58);
  const { locating, locationFocus, locate } = useMyLocation();
  const useLocationAsPickup = useRef(false);
  const [stops, setStops] = useState<Record<StopKey, Stop>>({ pickup: { label: '' }, destination: { label: params?.destinationLabel ?? '', coordinate: params?.destinationCoordinate } });
  const [selectedRide, setSelectedRide] = useState(0);
  const [page, setPage] = useState<'options' | 'driver'>('options');
  const [bookedRoute, setBookedRoute] = useState<RoadRoute>();
  const [cancellationOpen, setCancellationOpen] = useState(false);
  const { session, applyEvent } = useRideLifecycle({ pickup: stops.pickup.label, destination: stops.destination.label, title: `${rides[selectedRide].name} ride`, detail: ['Toyota Yaris', 'Lexus RX', 'Mercedes-Benz GLE'][selectedRide] + ' · SW 681 BS' });
  const wallet = useWallet();
  const { ensureConversation } = useMessaging();
  const phase = session?.phase ?? 'arriving';
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const completed = phase === 'completed' || phase === 'rated';
  const processingPayment = phase === 'processing_payment';
  const cancelable = phase === 'arriving' || phase === 'arrived';
  const arrivalProgress = useArrivalSimulation(session?.id, page === 'driver' && phase === 'arriving', () => {
    if (session) applyEvent({ type: 'arrived', rideId: session.id });
  });
  const journeyProgress = useArrivalSimulation(session ? `${session.id}:journey` : undefined, page === 'driver' && phase === 'in_progress', () => {
    if (session) applyEvent({ type: 'completed', rideId: session.id, fare: session.fare });
  });
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [panel, setPanel] = useState<Panel>(params?.focusDestination ? 'destination' : null);
  const [draft, setDraft] = useState(params?.destinationLabel ?? '');
  const suggestions = usePlaceSuggestions(draft, panel === 'pickup' || panel === 'destination');
  const [mapSelection, setMapSelection] = useState<StopKey | null>(null);
  const [mapDraft, setMapDraft] = useState<Stop>({ label: '' });
  const [mapSearchExpanded, setMapSearchExpanded] = useState(false);
  const [mapQuery, setMapQuery] = useState('');
  const mapSuggestions = usePlaceSuggestions(mapQuery, Boolean(mapSelection && mapSearchExpanded));
  const mapInput = useRef<ComponentRef<typeof TextInput>>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const mapPickup = mapSelection === 'pickup' ? mapDraft.coordinate : stops.pickup.coordinate;
  const mapDestination = mapSelection === 'destination' ? mapDraft.coordinate : stops.destination.coordinate;
  const pickupNeedsName = /^(My current location|Pickup ·)/i.test(stops.pickup.label);
  const receiptPickup = pickupNeedsName && stops.pickup.coordinate
    ? `${stops.pickup.coordinate.latitude.toFixed(4)}, ${stops.pickup.coordinate.longitude.toFixed(4)}`
    : stops.pickup.label;
  usePickupAddress(stops.pickup.coordinate, pickupNeedsName, (point, label) => {
    setStops(current => current.pickup.coordinate?.latitude === point.latitude && current.pickup.coordinate?.longitude === point.longitude && /^(My current location|Pickup ·)/i.test(current.pickup.label)
      ? { ...current, pickup: { ...current.pickup, label } } : current);
  });
  const roadRoute = useRoadRoute(mapPickup, mapDestination);
  // Keep the confirmed road geometry through arrival, ride start and payment.
  const passengerRoute = page === 'driver' ? bookedRoute ?? roadRoute.route : roadRoute.route;
  useEffect(() => {
    if (page === 'driver' && !bookedRoute && roadRoute.route) setBookedRoute(roadRoute.route);
  }, [page, bookedRoute, roadRoute.route]);
  const journeyMovement = useMemo(() => routeProgress(passengerRoute?.coordinates ?? [], journeyProgress), [passengerRoute, journeyProgress]);
  const sampleDriver = useMemo(() => stops.pickup.coordinate ? sampleDriverLocation(stops.pickup.coordinate) : undefined, [stops.pickup.coordinate?.latitude, stops.pickup.coordinate?.longitude]);
  const driverStart = page === 'driver' && !mapSelection && phase === 'arriving' ? sampleDriver : undefined;
  // Prepare the approach as soon as pickup is known so the 10-second fixture
  // can begin moving immediately after confirmation.
  const driverApproach = useRoadRoute(sampleDriver, stops.pickup.coordinate);
  // Render the car at the road-snapped route origin once the approach is loaded.
  const approachProgress = useMemo(() => routeProgress(driverApproach.route?.coordinates ?? [], arrivalProgress), [driverApproach.route, arrivalProgress]);
  const driverCoordinate = page !== 'driver' || completed || processingPayment ? undefined : phase === 'in_progress' ? journeyMovement.coordinate ?? stops.pickup.coordinate : phase === 'arrived' ? stops.pickup.coordinate : approachProgress.coordinate ?? driverStart;
  const driverArrivalLabel = driverApproach.route
    ? `${(driverApproach.route.distanceMeters * (1 - arrivalProgress) / 1000).toFixed(1)} km away · ${Math.max(1, Math.round(driverApproach.route.durationSeconds * (1 - arrivalProgress) / 60))} min`
    : driverApproach.status === 'error' ? 'Driver location' : 'Calculating arrival…';
  const savedPlaces = useSavedPlaces();
  const savedLocations = savedPlaces.places;
  const [mapCardHeight, setMapCardHeight] = useState(190);
  const mapBottomInset = mapCardHeight + Math.max(insets.bottom, 16) + 16 + (Platform.OS === 'ios' ? keyboardHeight : 0);
  const isMapLocationSaved = Boolean(mapDraft.coordinate && savedLocations.some(place => place.coordinate?.latitude === mapDraft.coordinate?.latitude && place.coordinate?.longitude === mapDraft.coordinate?.longitude));
  const mapSheetOffset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(mapSheetOffset, { toValue: mapSelection ? screenHeight : 0, duration: 240, useNativeDriver: true }).start();
  }, [mapSelection, screenHeight, mapSheetOffset]);
  const ride = rides[selectedRide];
  const selectedFare = Number(ride.priceXaf.replace(/,/g, ''));
  const canAffordRide = wallet.available >= selectedFare;
  const footerHeight = 96 + Math.max(insets.bottom, 16);
  const model = ['Toyota Yaris', 'Lexus RX', 'Mercedes-Benz GLE'][selectedRide];
  const cameraCoordinates = useMemo(() => [
    ...(passengerRoute?.coordinates ?? [mapPickup, mapDestination].filter((point): point is MapCoordinate => Boolean(point))),
    ...(page === 'driver' && phase === 'arriving' ? driverApproach.route?.coordinates ?? [] : []),
  ], [passengerRoute, mapPickup, mapDestination, page, phase, driverApproach.route]);
  const journeyLabel = passengerRoute ? `About ${Math.max(1, Math.round(passengerRoute.durationSeconds * (1 - journeyProgress) / 60))} min to your destination` : 'Follow your trip on the map';
  useEffect(() => {
    if (!session) return;
    scroll.current?.scrollTo({ y: 0, animated: true });
    setPanel(null); setCancellationOpen(false);
  }, [session?.phase]);
  // Keep an active local trip mounted so a back gesture cannot orphan its hold.
  usePreventRemove(page === 'driver' && !completed && phase !== 'canceled', () => {
    if (processingPayment) return;
    if (cancelable) setCancellationOpen(true);
    else setPanel('safety');
  });

  useEffect(() => {
    if (locationFocus && useLocationAsPickup.current) {
      const point = locationFocus.coordinate;
      setStops(current => ({ ...current, pickup: { label: `Pickup · ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`, coordinate: point } }));
      useLocationAsPickup.current = false;
    }
  }, [locationFocus]);

  function editStop(key: StopKey) { setDraft(stops[key].label); setPanel(key); }
  function chooseSuggestion(place: PlaceSuggestion) {
    if (panel !== 'pickup' && panel !== 'destination') return;
    const key = panel;
    setStops(current => ({ ...current, [key]: { label: place.label, coordinate: place.coordinate } }));
    setMapSelection(null);
    Keyboard.dismiss();
    setPanel(null);
    sheet.snap(false);
  }
  function saveStop() {
    if ((panel !== 'pickup' && panel !== 'destination') || !draft.trim()) return;
    const key = panel;
    setStops(current => ({ ...current, [key]: { label: draft.trim(), coordinate: draft.trim() === current[key].label ? current[key].coordinate : undefined } }));
    setPanel(null);
  }
  function selectOnMap(coordinate: MapCoordinate) {
    if (!mapSelection) return;
    const key = mapSelection;
    setMapDraft({ label: `${key === 'pickup' ? 'Pickup' : 'Destination'} · ${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}`, coordinate });
    setMapSearchExpanded(false); setMapQuery(''); Keyboard.dismiss();
  }
  function openMap(key: StopKey) {
    setMapDraft(stops[key].coordinate ? { ...stops[key] } : { label: '' });
    setMapSearchExpanded(false); setMapQuery('');
    setMapSelection(key); setPanel(null); Keyboard.dismiss(); sheet.snap(false);
  }
  function chooseMapSuggestion(place: PlaceSuggestion) {
    setMapDraft({ label: place.label, coordinate: place.coordinate });
    setMapSearchExpanded(false); setMapQuery(''); Keyboard.dismiss();
  }
  function finishMapSelection() {
    if (!mapSelection || !mapDraft.coordinate || !mapDraft.label.trim()) return;
    const key = mapSelection;
    setStops(current => ({ ...current, [key]: { ...mapDraft, label: mapDraft.label.trim() } }));
    Keyboard.dismiss(); setMapSelection(null);
  }
  function toggleSavedLocation() {
    if (!mapDraft.coordinate || !mapDraft.label.trim()) return;
    navigation.navigate('SavedPlaces', { location: { label: mapDraft.label.trim(), coordinate: mapDraft.coordinate } });
  }
  function confirmRide() {
    if (!canAffordRide) { setPanel('wallet'); return; }
    if (!stops.pickup.label.trim()) editStop('pickup');
    else if (!stops.destination.label.trim()) editStop('destination');
    else {
      // Server-issued PIN/session replaces this development fixture at integration.
      const accepted = applyEvent({ type: 'confirmed', rideId: `ride-${Date.now()}`, pin: '4826', fare: Number(ride.priceXaf.replace(/,/g, '')) });
      if (accepted) { setBookedRoute(roadRoute.route); setRating(0); setFeedback(''); setMapSelection(null); setPage('driver'); scroll.current?.scrollTo({ y: 0, animated: false }); }
      else setPanel('wallet');
    }
  }
  function cancelRide() {
    if (cancelable) setCancellationOpen(true);
  }
  function confirmCancellation() {
    // Local cancellation only. The server must authorize the fee and debit the
    // wallet atomically with cancellation when booking/payments are connected.
    if (!session || !applyEvent({ type: 'canceled', rideId: session.id })) return;
    setCancellationOpen(false); setPage('options'); setPanel(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function contactDriver(mode: 'message' | 'voice') {
    if (!session) return;
    const conversationId = `ride:${session.id}`;
    ensureConversation(driverConversation(conversationId, { pickup: stops.pickup.label, destination: stops.destination.label, vehicle: `${model} · White`, plate: 'SW 681 BS' }));
    setPanel(null);
    if (mode === 'message') navigation.navigate('Conversation', { conversationId });
    else navigation.navigate('Call', { conversationId, mode: 'voice' });
  }
  async function shareTrip() {
    try { await Share.share({ message: `I’m riding with Zipp. Driver: Alex. Car: ${model}, white, SW 681 BS. Pickup: ${stops.pickup.label}. Destination: ${stops.destination.label}.` }); } catch { /* The share sheet can be dismissed without affecting the ride. */ }
  }
  function finishRating() {
    if (session && applyEvent({ type: 'rated', rideId: session.id, rating, feedback })) Keyboard.dismiss();
  }

  const routeSummary = roadRoute.status === 'loading'
    ? <View style={styles.routeSummary}><ActivityIndicator size="small" color={colors.primary} /><Text translate style={styles.small}>Finding a driving route…</Text></View>
    : roadRoute.status === 'error'
      ? <Pressable accessibilityRole="button" onPress={roadRoute.retry} style={styles.routeSummary}><Ionicons name="refresh" size={17} color={colors.primary} /><Text translate style={styles.routeSummaryText}>No road route available. Tap to retry or adjust your stops.</Text></Pressable>
      : passengerRoute
        ? <View style={styles.routeSummary}><Ionicons name="navigate-outline" size={17} color={colors.primary} /><Text translate style={styles.routeSummaryText}>{(passengerRoute.distanceMeters / 1000).toFixed(1)} km · About {Math.max(1, Math.round(passengerRoute.durationSeconds / 60))} min driving</Text></View>
        : null;

  return <View style={styles.screen} onLayout={event => setScreenHeight(event.nativeEvent.layout.height)}>
    <StatusBar style="dark" />
    <RideMap pickup={mapPickup} destination={mapDestination} route={passengerRoute?.coordinates} driverRoute={page === 'driver' && phase === 'arriving' ? approachProgress.remaining : undefined} cameraCoordinates={cameraCoordinates} drivers={driverCoordinate ? [{ id: "assigned-driver", coordinate: driverCoordinate, heading: phase === 'in_progress' ? journeyMovement.heading : approachProgress.heading, arrivalLabel: phase === 'arrived' ? 'Your driver is here' : phase === 'in_progress' ? journeyLabel : driverArrivalLabel }] : undefined} bottomInset={0} topInset={insets.top + 84} cameraBottomInset={mapSelection ? mapBottomInset : sheet.expanded ? sheet.expandedHeight : sheet.collapsedHeight} attributionBottomInset={mapSelection ? mapBottomInset : sheet.expandedHeight} overlayTranslateY={mapSelection ? undefined : sheet.translateY} locationFocus={locationFocus} showControls={false} onSelectCoordinate={selectOnMap} />
    {!mapSelection && <View style={[styles.header, { top: insets.top + 10 }]}>
      {page === 'options' ? <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={() => navigation.goBack()} style={styles.circle}><Ionicons name="arrow-back" size={23} color={colors.navy} /></Pressable> : <View style={styles.headerSpacer} />}
      <Pressable accessibilityRole={__DEV__ && page === 'driver' ? 'button' : undefined} accessibilityLabel={__DEV__ && page === 'driver' ? 'Your ride. Long press for development events' : undefined} onLongPress={() => { if (__DEV__ && page === 'driver' && !processingPayment) setPanel('events'); }} style={styles.headerLabel}><Text translate style={styles.headerTitle}>{page === 'driver' ? processingPayment ? 'Payment' : completed ? 'Trip summary' : 'Your ride' : 'Book a ride'}</Text></Pressable>
      {page === 'options' ? <Pressable accessibilityRole="button" accessibilityLabel="Edit pickup location" onPress={() => editStop('pickup')} style={styles.circle}><Ionicons name="options-outline" size={22} color={colors.navy} /></Pressable> : <View style={styles.headerSpacer} />}
    </View>}
    {mapSelection && <View style={[styles.mapHint, { top: insets.top + 10 }]}><Text translate style={styles.hintText}>Search below or tap the map to set your {mapSelection}</Text><Pressable accessibilityRole="button" accessibilityLabel="Cancel map selection" onPress={() => { setMapSelection(null); setMapSearchExpanded(false); Keyboard.dismiss(); }} style={styles.mapClose}><Ionicons name="close" size={23} color={colors.navy} /></Pressable></View>}
    <Animated.View style={[styles.locationControl, { bottom: mapSelection ? mapBottomInset + 40 : sheet.expandedHeight + 38, transform: [{ translateY: mapSelection ? 0 : sheet.translateY }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Center on my location" disabled={locating} onPress={() => { useLocationAsPickup.current = false; void locate(); }} style={styles.circle}>{locating ? <ActivityIndicator color={colors.primary} /> : <Image source={require('../../assets/current-location.png')} resizeMode="contain" style={styles.optionIcon} />}</Pressable>
    </Animated.View>
    {mapSelection && <KeyboardAvoidingView pointerEvents="box-none" style={styles.mapCardOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.mapCard, { marginBottom: Math.max(insets.bottom, 16), maxHeight: Math.max(200, screenHeight - insets.top - (Platform.OS === 'ios' ? keyboardHeight : 0) - 110) }]} onLayout={event => setMapCardHeight(event.nativeEvent.layout.height)}>
        <View style={styles.mapCardHeading}><Text translate style={styles.sectionTitle}>{mapSelection === 'pickup' ? 'Pickup location' : 'Destination location'}</Text><Pressable accessibilityRole="button" accessibilityLabel={mapSearchExpanded ? 'Collapse location search' : 'Expand location search'} accessibilityState={{ expanded: mapSearchExpanded }} onPress={() => { if (mapSearchExpanded) { setMapSearchExpanded(false); Keyboard.dismiss(); } else { setMapSearchExpanded(true); mapInput.current?.focus(); } }} hitSlop={10}><Ionicons name={mapSearchExpanded ? 'chevron-down' : 'chevron-up'} size={20} color={colors.navy} /></Pressable></View>
        {!mapSearchExpanded && routeSummary}
        <View style={styles.mapLocationField}><Image source={require('../../assets/location.png')} resizeMode="contain" style={styles.optionIcon} /><TextInput ref={mapInput} accessibilityLabel="Selected map location" value={mapDraft.label} onFocus={() => { setMapSearchExpanded(true); setMapQuery(mapDraft.label); }} onChangeText={label => { setMapDraft({ label }); setMapQuery(label); setMapSearchExpanded(true); }} placeholder="Search address or tap the map" placeholderTextColor={colors.secondaryText} style={styles.mapLocationInput} maxLength={160} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} /></View>
        {mapSearchExpanded && <ScrollView style={styles.mapSuggestionList} contentContainerStyle={styles.mapSuggestionContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {mapSuggestions.status === 'idle' && <Text translate style={styles.small}>Type at least 3 characters to find a place.</Text>}
          {mapSuggestions.status === 'loading' && <View style={styles.searchStatus}><ActivityIndicator size="small" color={colors.primary} /><Text translate style={styles.small}>Finding places…</Text></View>}
          {mapSuggestions.status === 'error' && <Pressable accessibilityRole="button" onPress={mapSuggestions.retry} style={styles.optionRow}><Ionicons name="refresh" size={18} color={colors.primary} /><Text translate style={styles.optionText}>Couldn’t load places. Tap to retry.</Text></Pressable>}
          {mapSuggestions.status === 'ready' && mapSuggestions.places.length === 0 && <Text translate style={styles.small}>No matching places. Try a nearby landmark or tap the map.</Text>}
          {mapSuggestions.places.map(place => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Pin ${place.label}`} onPress={() => chooseMapSuggestion(place)} style={styles.optionRow}><Image source={require('../../assets/location.png')} resizeMode="contain" style={styles.optionIcon} /><View style={styles.flex}><Text translate style={styles.optionText}>{place.title}</Text>{Boolean(place.subtitle) && <Text translate style={styles.small}>{place.subtitle}</Text>}</View></Pressable>)}
          {mapSuggestions.places.length > 0 && <Text translate style={styles.small}>Photon · © OpenStreetMap contributors</Text>}
        </ScrollView>}
        <View style={styles.mapCardActions}><View style={styles.flex}><ActionButton accessibilityLabel="Done selecting location" disabled={!mapDraft.coordinate || !mapDraft.label.trim()} onPress={finishMapSelection}>Done</ActionButton></View><Pressable accessibilityRole="button" accessibilityLabel={isMapLocationSaved ? 'Edit saved location' : 'Save location'} accessibilityState={{ selected: isMapLocationSaved, disabled: !mapDraft.coordinate || !mapDraft.label.trim() }} disabled={!mapDraft.coordinate || !mapDraft.label.trim()} onPress={toggleSavedLocation} style={[styles.saveLocationButton, isMapLocationSaved && styles.savedLocationButton, (!mapDraft.coordinate || !mapDraft.label.trim()) && { opacity: 0.4 }]}><Image source={require('../../assets/save-location.png')} resizeMode="contain" style={styles.optionIcon} /></Pressable></View>
      </View>
    </KeyboardAvoidingView>}
    <Animated.View pointerEvents={mapSelection ? 'none' : 'auto'} accessibilityElementsHidden={Boolean(mapSelection)} importantForAccessibility={mapSelection ? 'no-hide-descendants' : 'auto'} style={[styles.sheet, { height: sheet.expandedHeight, transform: [{ translateY: Animated.add(sheet.translateY, mapSheetOffset) }] }]}>
      <View {...sheet.panHandlers}><Pressable accessibilityRole="button" accessibilityLabel={sheet.expanded ? 'Collapse ride options' : 'Expand ride options'} accessibilityState={{ expanded: sheet.expanded }} onPress={() => sheet.snap(!sheet.expanded)} style={styles.handleArea}><View style={styles.handle} /></Pressable></View>
      <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: footerHeight + (sheet.expanded ? 0 : sheet.travel) + 20 }]}>
        {!processingPayment && routeSummary}
        {page === 'driver' ? processingPayment ? <View style={[styles.paymentProcessing, { minHeight: Math.max(260, sheet.collapsedHeight - 40) }]} accessibilityLiveRegion="polite"><View style={styles.paymentSpinner}><ActivityIndicator size="large" color={colors.primary} /></View><Text translate style={styles.paymentProcessingTitle}>Processing payment</Text><Text translate style={styles.paymentProcessingAmount}>{formatXaf(session?.fare ?? selectedFare)}</Text><Text translate style={styles.panelCopy}>Paying from your Zipp Wallet</Text></View> : completed && session ? <RideCompletion fare={session.fare} paid={session.paid} rated={phase === 'rated'} rating={rating} feedback={feedback} pickup={receiptPickup} destination={stops.destination.label} image={ride.image} model={model} distance={passengerRoute?.distanceMeters} duration={passengerRoute?.durationSeconds} onRating={setRating} onFeedback={setFeedback} /> : <RideDriverDetails name={ride.name} model={model} image={ride.image} pickup={stops.pickup.label} destination={stops.destination.label} onMessage={() => contactDriver('message')} onCall={() => contactDriver('voice')} arrivalLabel={phase === 'in_progress' ? journeyLabel : driverArrivalLabel} phase={phase === 'arrived' || phase === 'in_progress' ? phase : 'arriving'} pin={session?.pin} onShare={() => { void shareTrip(); }} onSafety={() => setPanel('safety')} /> : <>
        <View style={styles.stops}>
          <View style={styles.stopFields}>
            {(['pickup', 'destination'] as const).map(key => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Edit ${key}`} onPress={() => editStop(key)} style={[styles.stopRow, key === 'pickup' && styles.stopDivider]}><View style={styles.stopMarker}>{key === 'pickup' ? <View style={styles.pickupDot}/> : <Ionicons name="location" size={24} color={colors.primary}/>}</View><View style={styles.flex}><Text translate style={styles.label}>{key === 'pickup' ? 'PICKUP' : 'DROP-OFF'}</Text><Text translate numberOfLines={2} style={[styles.stopText, !stops[key].label && styles.muted]}>{stops[key].label || (key === 'pickup' ? 'Set pickup location' : 'Where are you going?')}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.secondaryText} /></Pressable>)}
          </View>
        </View>
        {locationFocus && stops.pickup.coordinate?.latitude === locationFocus.coordinate.latitude && stops.pickup.coordinate?.longitude === locationFocus.coordinate.longitude && <Text translate style={styles.gpsAccuracy}>Device location{locationFocus.accuracy !== null ? ` · accuracy ±${Math.ceil(locationFocus.accuracy)} m` : ' · accuracy unavailable'} · Adjust pin if needed</Text>}
        <View style={styles.sectionRow}><Text translate style={styles.sectionTitle}>Choose your ride</Text><Text translate style={styles.small}>Just right for you</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rideRow}>
          {rides.map((item, index) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selectedRide === index }} accessibilityLabel={`${item.name}, ${item.seats} seats`} onPress={() => setSelectedRide(index)} style={[styles.rideCard, selectedRide === index && styles.selectedCard]}><View style={styles.rideTop}><View style={[styles.selectionDot, selectedRide === index && styles.selectionDotActive]}>{selectedRide === index && <Ionicons name="checkmark" size={10} color={colors.white} />}</View><View style={styles.seats}><Ionicons name="person" size={9} color={colors.secondaryText} /><Text translate style={styles.seatText}>{item.seats}</Text></View></View><Image source={item.image} resizeMode="contain" style={styles.carImage} /><Text  style={styles.rideName}>{item.name}</Text><View style={styles.rideMeta}><Text translate style={styles.rideDistance}>{item.distanceKm} km</Text><Text translate style={styles.ridePrice}>{item.priceXaf} XAF</Text></View></Pressable>)}
        </ScrollView>
        </>}
      </ScrollView>
    </Animated.View>
    {!mapSelection && !processingPayment && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {page === 'options' && <Text translate style={[styles.footerNote, styles.paymentNote]}>Pay with Zipp Wallet · {formatXaf(wallet.available)} available</Text>}
      {page === 'options' ? <ActionButton accessibilityLabel={canAffordRide ? "Confirm ride" : "Insufficient wallet balance"} onPress={confirmRide}>{canAffordRide ? "Confirm" : "Top up to book"}</ActionButton>
        : phase === 'completed' && !session?.paid ? <ActionButton accessibilityLabel="Pay ride from wallet" onPress={() => { if (session && !applyEvent({ type: 'payment_received', rideId: session.id })) setPanel('wallet'); }}>Pay {formatXaf(session?.fare ?? selectedFare)}</ActionButton>
        : phase === 'completed' ? <><ActionButton accessibilityLabel="Submit driver rating" onPress={finishRating} disabled={!rating}>Submit rating</ActionButton><Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.cancelRide}><Text translate style={styles.small}>Skip for now</Text></Pressable></>
        : phase === 'rated' ? <ActionButton accessibilityLabel="Back to Home" onPress={() => navigation.goBack()}>Back to Home</ActionButton>
        : phase === 'in_progress' ? <ActionButton accessibilityLabel="Open safety and support" onPress={() => setPanel('safety')}>Safety & support</ActionButton>
        : <>{phase === 'arrived' && <Text translate style={styles.footerNote}>Waiting for your driver to verify the trip PIN</Text>}<Pressable accessibilityRole="button" accessibilityLabel="Cancel ride" onPress={cancelRide} style={({ pressed }) => [styles.cancelRide, pressed && { opacity: 0.6 }]}><Text translate style={styles.cancelRideText}>Cancel ride</Text></Pressable></>}
    </View>}
    <CancelRideModal visible={cancellationOpen} fare={Number(ride.priceXaf.replace(/,/g, ''))} onClose={() => setCancellationOpen(false)} onConfirm={confirmCancellation} />
    <Modal transparent visible={panel !== null} animationType="slide" onRequestClose={() => setPanel(null)}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.backdrop} onPress={() => setPanel(null)} />
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 20), maxHeight: height - insets.top - 24 }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.sectionRow}><Text translate style={styles.panelTitle}>{panel === 'wallet' ? 'Wallet balance' : panel === 'events' ? 'Ride simulation' : panel === 'safety' ? 'Safety & support' : panel === 'pickup' ? 'Where from?' : 'Where to?'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close panel" onPress={() => setPanel(null)} hitSlop={10}><Ionicons name="close" size={24} color={colors.navy} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
          {(panel === 'pickup' || panel === 'destination') && <>
            <Text translate style={styles.small}>Enter an address or landmark, or choose a point on the map.</Text>
            <TextInput autoFocus value={draft} onChangeText={setDraft} placeholder={panel === 'pickup' ? 'Pickup address or landmark' : 'Destination address or landmark'} placeholderTextColor={colors.secondaryText} accessibilityLabel={`${panel} address`} style={styles.input} maxLength={160} returnKeyType="done" onSubmitEditing={saveStop} />
            {suggestions.status === 'loading' && <View style={styles.searchStatus}><ActivityIndicator size="small" color={colors.primary} /><Text translate style={styles.small}>Finding places…</Text></View>}
            {suggestions.status === 'error' && <Pressable accessibilityRole="button" onPress={suggestions.retry} style={styles.optionRow}><Ionicons name="refresh" size={20} color={colors.primary} /><Text translate style={styles.optionText}>Couldn’t load places. Tap to retry.</Text></Pressable>}
            {suggestions.status === 'ready' && suggestions.places.length === 0 && <Text translate style={styles.small}>No matching places found. Try a nearby landmark or choose on the map.</Text>}
            {suggestions.places.map(place => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Select ${place.label}`} onPress={() => chooseSuggestion(place)} style={styles.optionRow}><Image source={require('../../assets/location.png')} resizeMode="contain" style={styles.optionIcon} /><View style={styles.flex}><Text translate style={styles.optionText}>{place.title}</Text>{Boolean(place.subtitle) && <Text translate style={styles.small}>{place.subtitle}</Text>}</View><Ionicons name="chevron-forward" size={18} color={colors.secondaryText} /></Pressable>)}
            {suggestions.places.length > 0 && <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.openstreetmap.org/copyright'); }}><Text translate style={styles.small}>Place search: Photon · © OpenStreetMap contributors</Text></Pressable>}
            {panel === 'pickup' && <Pressable accessibilityRole="button" accessibilityLabel="Use my current location" accessibilityState={{busy:locating,disabled:locating}} disabled={locating} onPress={() => { Keyboard.dismiss(); useLocationAsPickup.current = true; void locate().then(fix => { if(fix) setPanel(null); else useLocationAsPickup.current = false; }); }} style={styles.optionRow}><Image source={require('../../assets/current-location.png')} resizeMode="contain" style={styles.optionIcon} /><Text translate style={[styles.optionText,{flex:1}]}>{locating ? 'Finding your location…' : 'Use my current location'}</Text>{locating&&<ActivityIndicator accessibilityLabel="Finding your location" size="small" color={colors.primary}/>}</Pressable>}
            <Pressable accessibilityRole="button" onPress={() => openMap(panel)} style={styles.optionRow}><Image source={require('../../assets/map-icon.png')} resizeMode="contain" style={styles.optionIcon} /><Text translate style={styles.optionText}>Choose on map</Text></Pressable>
            {savedLocations.length > 0 && <><Text translate style={styles.small}>Saved locations</Text>{savedLocations.map((place, index) => <Pressable key={`${place.coordinate?.latitude}:${place.coordinate?.longitude}`} accessibilityRole="button" onPress={() => { const key = panel; setStops(current => ({ ...current, [key]: place })); setPanel(null); Keyboard.dismiss(); }} style={styles.optionRow}><Image source={require('../../assets/save-location.png')} resizeMode="contain" style={styles.optionIcon} /><Text style={styles.optionText}>{place.label}</Text></Pressable>)}</>}
            <ActionButton accessibilityLabel="Save location" disabled={!draft.trim()} onPress={saveStop}>Save location</ActionButton>
          </>}
          {panel === 'wallet' && <>
            <View style={styles.walletNotice}><View style={styles.walletNoticeIcon}><Ionicons name="wallet-outline" size={27} color={colors.primary} /></View><Text translate style={styles.walletNoticeTitle}>Top up before you ride</Text><Text translate style={styles.panelCopy}>Your available wallet balance needs to cover the full ride fare.</Text></View>
            <View style={styles.walletBreakdown}><View style={styles.walletLine}><Text translate style={styles.small}>Available balance</Text><Text translate style={styles.optionText}>{formatXaf(wallet.available)}</Text></View><View style={styles.walletLine}><Text translate style={styles.small}>Ride fare</Text><Text translate style={styles.optionText}>{formatXaf(session && page === 'driver' ? session.fare : selectedFare)}</Text></View><View style={styles.walletLine}><Text translate style={styles.small}>Amount to add</Text><Text translate style={styles.walletShortfall}>{formatXaf(Math.max(0, (session && page === 'driver' ? session.fare : selectedFare) - wallet.available))}</Text></View></View>
            <ActionButton accessibilityLabel="Open wallet top up" onPress={() => { setPanel(null); navigation.navigate('RoleHome', { openWallet: true }); }}>Top up wallet</ActionButton>
          </>}
          {panel === 'safety' && <>
            <Text translate style={styles.panelCopy}>Check your driver’s details and keep someone you trust informed about your journey.</Text>
            <View style={styles.optionRow}><Ionicons name="car-outline" size={22} color={colors.primary} /><Text translate style={styles.optionText}>Alex · {model} · SW 681 BS</Text></View>
            <Pressable accessibilityRole="button" onPress={() => { void shareTrip(); }} style={styles.optionRow}><Ionicons name="share-social-outline" size={22} color={colors.primary} /><Text translate style={styles.optionText}>Share trip details</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => contactDriver('message')} style={styles.optionRow}><Ionicons name="chatbubble-outline" size={22} color={colors.primary} /><Text translate style={styles.optionText}>Message your driver</Text></Pressable>
            <Text translate style={styles.small}>If you’re in immediate danger, contact local emergency services.</Text>
          </>}
          {__DEV__ && panel === 'events' && session && <RideSimulationControls phase={phase} onNext={() => { if (phase === 'arriving') applyEvent({ type: 'arrived', rideId: session.id }); else if (phase === 'arrived') { applyEvent({ type: 'pin_verified', rideId: session.id }); applyEvent({ type: 'started', rideId: session.id }); } else setPanel(null); }} />}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  paymentProcessing: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 32 },
  paymentSpinner: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  paymentProcessingTitle: { fontSize: 22, fontWeight: '600', color: colors.navy },
  paymentProcessingAmount: { fontSize: 25, fontWeight: '700', color: colors.navy },
  panelCopy: { fontSize: 12, lineHeight: 21, fontWeight: '500', color: colors.secondaryText },
  walletNotice: { gap: 10 },
  walletNoticeIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  walletNoticeTitle: { fontSize: 20, fontWeight: '700', color: colors.navy },
  walletBreakdown: { padding: 16, borderRadius: 18, backgroundColor: colors.input, gap: 14 },
  walletLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  walletShortfall: { fontSize: 16, fontWeight: '600', color: colors.navy },
  routeSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  routeSummaryText: { flex: 1, fontSize: 11, fontWeight: '500', lineHeight: 18, color: colors.secondaryText },
  flex: { flex: 1 },
  header: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  circle: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  headerLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, backgroundColor: colors.white },
  headerTitle: { fontSize: 13, fontWeight: '600', color: colors.navy },
  headerSpacer: { width: 46, height: 46 },
  cancelRide: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelRideText: { fontSize: 16, fontWeight: '600', color: colors.error },
  mapHint: { position: 'absolute', left: 20, right: 20, padding: 14, borderRadius: 16, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hintText: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.navy },
  mapClose: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  mapCardOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'flex-end' },
  mapCard: { marginHorizontal: 16, padding: 18, borderRadius: 26, backgroundColor: colors.white, gap: 14, shadowColor: colors.navy, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 10 },
  mapCardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  mapSuggestionList: { maxHeight: 220, flexShrink: 1 },
  mapSuggestionContent: { gap: 8, paddingBottom: 4 },
  mapLocationField: { ...inputStyles.container, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapLocationInput: { ...inputStyles.text, flex: 1 },
  mapCardActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveLocationButton: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  savedLocationButton: { backgroundColor: colors.yellow },
  locationControl: { position: 'absolute', right: 20 },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, shadowColor: colors.navy, shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
  handleArea: { height: 26, alignItems: 'center', justifyContent: 'center' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 4, backgroundColor: '#D8DDDB' },
  content: { paddingHorizontal: 20 },
  stops: { flexDirection: 'row', borderRadius: 22, backgroundColor: colors.input, paddingHorizontal: 18, paddingVertical: 4 },
  stopRail: { width: 26, alignItems: 'center', paddingTop: 31, paddingBottom: 20 },
  pickupDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: colors.primary },
  rail: { width: 1, height: 48, marginVertical: 5, backgroundColor: '#C6CECA' },
  gpsAccuracy: {fontSize:12,lineHeight:19,color:colors.secondaryText,marginTop:8,marginHorizontal:6},
  stopMarker: { width: 28, alignItems: 'center', justifyContent: 'center' },
  stopFields: { flex: 1 },
  stopRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  stopDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE1E0' },
  label: { fontSize: 11, lineHeight: 17, marginBottom: 4, fontWeight: '600', letterSpacing: 1, color: colors.secondaryText },
  stopText: { fontSize: 17, fontWeight: '500', color: colors.navy, lineHeight: 26 },
  muted: { color: colors.secondaryText },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.navy },
  small: { fontSize: 10, fontWeight: '500', lineHeight: 17, color: colors.secondaryText },
  rideRow: { gap: 12, paddingBottom: 16 },
  rideCard: { width: 185, borderRadius: 20, padding: 14, backgroundColor: colors.input },
  selectedCard: { backgroundColor: colors.yellow },
  rideTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectionDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#C6CECA', alignItems: 'center', justifyContent: 'center' },
  selectionDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  seats: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  seatText: { fontSize: 9, fontWeight: '500', color: colors.secondaryText },
  carImage: { width: '100%', height: 92, marginVertical: 6 },
  rideName: { fontSize: 15, fontWeight: '600', color: colors.navy },
  rideMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, paddingTop: 5 },
  rideDistance: { fontSize: 11, fontWeight: '500', color: colors.secondaryText },
  ridePrice: { fontSize: 11, fontWeight: '600', color: colors.navy },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 12, paddingHorizontal: 20, backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footerNote: { fontSize: 9, fontWeight: '500', color: colors.secondaryText, textAlign: 'center', marginTop: 8 },
  paymentNote: { fontSize: 12, marginTop: 0, marginBottom: 8 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(18,27,38,0.35)' },
  panel: { flexShrink: 1, maxHeight: '100%', backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 },
  panelTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.navy },
  panelContent: { gap: 12 },
  input: { ...inputStyles.field },
  searchStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 15, backgroundColor: colors.input },
  optionIcon: { width: 24, height: 24 },
  optionText: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.navy },
});
