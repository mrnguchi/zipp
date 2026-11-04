import {KeyboardAwareScrollView as ScrollView} from '../components/KeyboardAwareScrollView';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from '../components/LocalizedNative';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {ActivityIndicator, Animated, Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Share, StyleSheet, View, useWindowDimensions} from 'react-native';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { RideMap } from '../components/maps/RideMap';
import type { MapCoordinate } from '../components/maps/mapGeometry';
import { PlacePickerSheet } from '../components/PlacePickerSheet';
import { useSavedPlaces } from '../contexts/SavedPlacesContext';
import { MapStopCard } from '../components/MapStopCard';
import { PackagePhotoPreview } from '../components/PackagePhotoPreview';
import { DeliveryDetailsForm } from '../components/DeliveryDetailsForm';
import { DeliveryBookingProgress } from '../components/DeliveryBookingProgress';
import { DeliveryPerspectivePicker } from '../components/DeliveryPerspectivePicker';
import { DeliveryTracking } from '../components/DeliveryTracking';
import { DeliveryReceipt } from '../components/DeliveryReceipt';
import { colors } from '../constants/colors';
import { useProfile, profileDisplayName } from '../contexts/ProfileContext';
import { useWallet } from '../contexts/WalletContext';
import { useHomeSheet } from '../hooks/useHomeSheet';
import { useMyLocation } from '../hooks/useMyLocation';
import { usePickupAddress as usePlaceAddress } from '../hooks/usePickupAddress';
import { useRoadRoute } from '../hooks/useRoadRoute';
import { useArrivalSimulation } from '../hooks/useArrivalSimulation';
import { useDeliveryLifecycle } from '../hooks/useDeliveryLifecycle';
import { sampleDriverLocation } from '../utils/sampleDriverLocation';
import { routeProgress } from '../utils/routeProgress';
import { formatXaf } from '../utils/formatCurrency';
import { createDeliveryDraft, deliveryFare, switchDeliveryPerspective, validateDelivery } from '../services/deliveryFlow';
import type { DeliveryDraft, DeliveryPerspective, DeliveryStop } from '../services/deliveryFlow';
import type { RootStackParamList } from '../navigation/types';

type StopKey = 'pickup' | 'dropoff';
type Panel = 'cancel' | 'contact' | 'call' | 'support' | 'wallet' | 'simulation' | null;
export function DeliveryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { profile } = useProfile();
  const wallet = useWallet();
  const [screenHeight, setScreenHeight] = useState(height);
  const sheet = useHomeSheet(screenHeight, insets.top + 64, 0.6);
  const [draft, setDraft] = useState<DeliveryDraft>(() => createDeliveryDraft(profileDisplayName(profile) ?? '', profile?.phone ?? ''));
  const receiving = draft.perspective === 'receiving';
  const [step, setStep] = useState(0);
  useEffect(() => { if (step === 1) sheet.snap(true); }, [step, sheet.snap]);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<StopKey | null>(null);
  const [mapKey, setMapKey] = useState<StopKey | null>(null);
  const [mapDraft, setMapDraft] = useState<DeliveryStop>();
  const savedPlaces = useSavedPlaces();
  const saved = savedPlaces.places;
  const [mapHeight, setMapHeight] = useState(190);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState('');
  const [supportNote, setSupportNote] = useState('');
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const awaitingGps = useRef<StopKey | null>(null);
  const { locating, locationFocus, locate } = useMyLocation();
  const { session, applyEvent } = useDeliveryLifecycle(draft);
  const active = Boolean(session && !['canceled'].includes(session.phase));
  const phase = session?.phase;
  const finished = phase === 'delivered' || phase === 'rated';
  const processing = phase === 'processing_payment';
  const cancelable = phase === 'courier_arriving' || phase === 'at_pickup';
  const pickup = mapKey === 'pickup' ? mapDraft?.coordinate : draft.pickup?.coordinate;
  const dropoff = mapKey === 'dropoff' ? mapDraft?.coordinate : draft.dropoff?.coordinate;
  const route = useRoadRoute(pickup, dropoff);
  const fare = route.route ? deliveryFare(route.route.distanceMeters, draft.mode) : 0;
  const sampleCourier = useMemo(() => draft.pickup ? sampleDriverLocation(draft.pickup.coordinate) : undefined, [draft.pickup?.coordinate.latitude, draft.pickup?.coordinate.longitude]);
  const approach = useRoadRoute(sampleCourier, draft.pickup?.coordinate);
  const arrivalProgress = useArrivalSimulation(session?.id, phase === 'courier_arriving', () => { if (session) applyEvent({ type: 'courier_arrived', deliveryId: session.id }); });
  const tripProgress = useArrivalSimulation(session ? `${session.id}:delivery` : undefined, phase === 'in_transit', () => { if (session) applyEvent({ type: 'destination_arrived', deliveryId: session.id }); });
  const arrivalMovement = useMemo(() => routeProgress(approach.route?.coordinates ?? [], arrivalProgress), [approach.route, arrivalProgress]);
  const tripMovement = useMemo(() => routeProgress(route.route?.coordinates ?? [], tripProgress), [route.route, tripProgress]);
  const courier = !active || finished || processing ? undefined : phase === 'courier_arriving' ? arrivalMovement.coordinate ?? sampleCourier : phase === 'at_pickup' ? draft.pickup?.coordinate : phase === 'in_transit' ? tripMovement.coordinate ?? draft.pickup?.coordinate : draft.dropoff?.coordinate;
  const eta = phase === 'courier_arriving' ? approach.route ? `${(approach.route.distanceMeters * (1 - arrivalProgress) / 1000).toFixed(1)} km to pickup · ${Math.max(1, Math.round(approach.route.durationSeconds * (1 - arrivalProgress) / 60))} min` : 'Finding the pickup route…' : phase === 'at_pickup' ? receiving ? 'Courier at the sender' : 'Courier at your pickup' : phase === 'at_dropoff' ? receiving ? 'Courier at your location' : 'Courier at the recipient' : route.route ? `About ${Math.max(1, Math.round(route.route.durationSeconds * (1 - tripProgress) / 60))} min to ${receiving ? 'your location' : 'drop-off'}` : 'Following the delivery route';
  const cameraCoordinates = useMemo(() => [...(route.route?.coordinates ?? [pickup, dropoff].filter((point): point is MapCoordinate => Boolean(point))), ...(phase === 'courier_arriving' ? approach.route?.coordinates ?? [] : [])], [route.route, pickup, dropoff, phase, approach.route]);
  const mapBottom = mapHeight + keyboardHeight + Math.max(16, insets.bottom) + 16;
  const hideSheet = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(hideSheet, { toValue: mapKey ? screenHeight : 0, duration: 240, useNativeDriver: true }).start(); }, [mapKey, screenHeight, hideSheet]);
  useEffect(() => { const show = Keyboard.addListener('keyboardDidShow', event => setKeyboardHeight(event.endCoordinates.height)); const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0)); return () => { show.remove(); hide.remove(); }; }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: true }); setPanel(null); }, [phase, step]);
  useEffect(() => {
    if (!locationFocus || !awaitingGps.current) return;
    const key = awaitingGps.current;
    awaitingGps.current = null;
    const point = locationFocus.coordinate;
    setDraft(current => ({ ...current, [key]: { coordinate: point, label: `${key === 'pickup' ? 'Pickup' : 'Drop-off'} · ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}` } }));
    setError('');
  }, [locationFocus]);
  usePlaceAddress(draft.pickup?.coordinate, Boolean(draft.pickup?.label.startsWith('Pickup ·')), (point, label) => { setDraft(current => current.pickup?.coordinate.latitude === point.latitude && current.pickup?.coordinate.longitude === point.longitude && current.pickup.label.startsWith('Pickup ·') ? { ...current, pickup: { coordinate: point, label } } : current); });
  usePlaceAddress(draft.dropoff?.coordinate, Boolean(draft.dropoff?.label.startsWith('Drop-off ·')), (point, label) => { setDraft(current => current.dropoff?.coordinate.latitude === point.latitude && current.dropoff?.coordinate.longitude === point.longitude && current.dropoff.label.startsWith('Drop-off ·') ? { ...current, dropoff: { coordinate: point, label } } : current); });
  usePreventRemove(active && !finished, () => { if (!processing) setPanel(cancelable ? 'cancel' : 'support'); });

  function change(update: Partial<DeliveryDraft>) { setDraft(current => ({ ...current, ...update })); setError(''); }
  function changePerspective(perspective: DeliveryPerspective) {
    if (active) return;
    awaitingGps.current = null; setPicker(null); setMapKey(null); setMapDraft(undefined);
    setDraft(current => switchDeliveryPerspective(current, perspective)); setError(''); Keyboard.dismiss();
  }
  function locateFor(key: StopKey) { awaitingGps.current = key; Keyboard.dismiss(); void locate().then(fix=>{if(fix)setPicker(null);else awaitingGps.current=null;}); }
  function selectStop(stop: DeliveryStop) { if (!picker) return; awaitingGps.current = null; change({ [picker]: stop }); setPicker(null); Keyboard.dismiss(); }
  function openMap() { if (!picker) return; awaitingGps.current = null; setMapDraft(draft[picker]); setMapKey(picker); setPicker(null); Keyboard.dismiss(); }
  function selectMap(coordinate: MapCoordinate) { if (!mapKey) return; setMapDraft({ coordinate, label: `${mapKey === 'pickup' ? 'Pickup' : 'Drop-off'} · ${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}` }); Keyboard.dismiss(); }
  function finishMap() { if (!mapKey || !mapDraft) return; change({ [mapKey]: mapDraft }); setMapKey(null); Keyboard.dismiss(); }
  const mapSaved = Boolean(mapDraft && saved.some(place => place.coordinate.latitude === mapDraft.coordinate.latitude && place.coordinate.longitude === mapDraft.coordinate.longitude));
  function saveMap() { if (!mapDraft) return; navigation.navigate('SavedPlaces', { location: mapDraft }); }
  function next() {
    if (awaitingGps.current && locating) { setError('Finding your location. Please wait or choose another location.'); return; }
    const problem = validateDelivery(draft, step);
    if (problem) { setError(problem); return; }
    if (route.status !== 'ready') { setError('Wait for a driving route, or retry the route lookup.'); return; }
    if (step < 2) { setStep(step + 1); Keyboard.dismiss(); return; }
    if (wallet.available < fare) { setPanel('wallet'); return; }
    if (!applyEvent({ type: 'requested', deliveryId: `delivery-${Date.now()}`, fare, pin: '7352', perspective: draft.perspective })) { setPanel('wallet'); return; }
    setError(''); setRating(0); setFeedback(''); setMessage(''); setSupportNote(''); Keyboard.dismiss(); sheet.snap(false);
  }
  async function shareDelivery(pin = false) {
    try { await Share.share({ message: pin ? `Your Zipp delivery PIN is ${session?.pin}. Give it to the courier only after receiving your package.` : `Zipp delivery for ${draft.recipientName}. From: ${draft.pickup?.label}. To: ${draft.dropoff?.label}. Courier: Michael. Status: ${phase === 'in_transit' ? 'On the way' : phase === 'at_dropoff' ? 'At destination' : 'Collecting package'}.` }); } catch { /* Dismissing share leaves delivery unchanged. */ }
  }
  function simulateNext() { if (!session) return; const type = phase === 'courier_arriving' ? 'courier_arrived' : phase === 'at_pickup' ? 'collected' : phase === 'in_transit' ? 'destination_arrived' : phase === 'at_dropoff' ? 'handover_verified' : undefined; if (type) applyEvent({ type, deliveryId: session.id }); else setPanel(null); }
  function callCourier() {
    if (!session?.courierPhone) { setPanel('call'); return; }
    void Linking.openURL(`tel:${session.courierPhone.replace(/[^+\d]/g, '')}`).catch(() => setPanel('call'));
  }

  return <View style={styles.screen} onLayout={event => setScreenHeight(event.nativeEvent.layout.height)}>
    <StatusBar style="dark" />
    <RideMap pickup={pickup} destination={dropoff} route={phase === 'in_transit' ? tripMovement.remaining : route.route?.coordinates} driverRoute={phase === 'courier_arriving' ? arrivalMovement.remaining : undefined} drivers={courier ? [{ id: 'delivery-courier', coordinate: courier, kind: 'courier', arrivalLabel: eta }] : undefined} cameraCoordinates={cameraCoordinates} bottomInset={0} topInset={insets.top + 84} cameraBottomInset={mapKey ? mapBottom : sheet.expanded ? sheet.expandedHeight : sheet.collapsedHeight} attributionBottomInset={mapKey ? mapBottom : sheet.expandedHeight} overlayTranslateY={mapKey ? undefined : sheet.translateY} locationFocus={locationFocus} showControls={false} onSelectCoordinate={selectMap} />
    <View style={[styles.header, { top: insets.top + 10 }]}>
      {mapKey ? <Text translate style={styles.mapHint}>Search below or tap the map</Text> : <>
        {!active ? <Pressable accessibilityRole="button" accessibilityLabel={step ? 'Previous delivery step' : 'Back to Home'} onPress={() => step ? setStep(step - 1) : navigation.goBack()} style={styles.circle}><Ionicons name="arrow-back" size={23} color={colors.navy} /></Pressable> : <View style={styles.spacer} />}
        <Pressable onLongPress={() => { if (__DEV__ && active && !processing && !finished) setPanel('simulation'); }} style={styles.headerTitle}><Text translate style={styles.headerText}>{processing ? 'Payment' : finished ? 'Delivery receipt' : active ? 'Your delivery' : 'Book a delivery'}</Text></Pressable>
      </>}
      <Pressable accessibilityRole="button" accessibilityLabel={mapKey ? 'Close map selection' : 'Delivery help'} onPress={() => { if (mapKey) { setMapKey(null); Keyboard.dismiss(); } else setPanel('support'); }} style={styles.circle}><Ionicons name={mapKey ? 'close' : 'help-circle-outline'} size={23} color={colors.navy} /></Pressable>
    </View>
    <Animated.View style={[styles.locate, { bottom: mapKey ? mapBottom + 38 : sheet.expandedHeight + 38, transform: [{ translateY: mapKey ? 0 : sheet.translateY }] }]}><Pressable accessibilityRole="button" accessibilityLabel="Center on my location" disabled={locating} onPress={() => { awaitingGps.current = null; void locate(); }} style={styles.circle}>{locating ? <ActivityIndicator color={colors.primary} /> : <Image source={require('../../assets/current-location.png')} style={styles.icon} resizeMode="contain" />}</Pressable></Animated.View>
    <Animated.View pointerEvents={mapKey ? 'none' : 'auto'} accessibilityElementsHidden={Boolean(mapKey)} style={[styles.sheet, { height: sheet.expandedHeight, transform: [{ translateY: Animated.add(sheet.translateY, hideSheet) }] }]}>
      <View {...sheet.panHandlers}><Pressable accessibilityRole="button" accessibilityLabel={sheet.expanded ? 'Collapse delivery sheet' : 'Expand delivery sheet'} onPress={() => sheet.snap(!sheet.expanded)} style={styles.handleArea}><View style={styles.handle} /></Pressable></View>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom + (sheet.expanded ? 0 : sheet.travel) }]}>
        {!active ? <>
          {step > 0 && <Pressable accessibilityRole="button" accessibilityLabel={step === 1 ? 'Back to route' : 'Back to package details'} onPress={() => { setStep(current => current - 1); setError(''); Keyboard.dismiss(); }} style={styles.sheetBack}><Ionicons name="arrow-back" size={20} color={colors.navy} /><Text translate style={styles.sheetBackText}>Back</Text></Pressable>}
          <DeliveryBookingProgress step={step} />
          {step === 0 && <DeliveryPerspectivePicker value={draft.perspective} onChange={changePerspective} />}
          <Text translate style={styles.title}>{step === 0 ? receiving ? 'Where are we collecting?' : 'Where is it going?' : step === 1 ? 'The details that matter' : 'Review your delivery'}</Text>
          {step === 0 && <>
            <StopRows draft={draft} onEdit={setPicker} />
            <Pressable accessibilityRole="button" accessibilityLabel={receiving ? 'Use my current location for drop-off' : 'Use my current location for pickup'} accessibilityState={{busy:locating,disabled:locating}} disabled={locating} onPress={() => locateFor(receiving ? 'dropoff' : 'pickup')} style={styles.selfLocation}><Image source={require('../../assets/current-location.png')} resizeMode="contain" style={styles.icon} /><Text translate style={styles.selfLocationText}>{locating ? 'Finding your location…' : receiving ? 'Deliver to my current location' : 'Collect from my current location'}</Text>{locating&&<ActivityIndicator accessibilityLabel="Finding your location" size="small" color={colors.primary}/>}</Pressable>
            <RouteInfo status={route.status} distance={route.route?.distanceMeters} duration={route.route?.durationSeconds} retry={route.retry} />
            <Text translate style={styles.sectionTitle}>Choose your delivery</Text>
            <View style={styles.modeRow}>{(['standard', 'express'] as const).map(mode => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: draft.mode === mode }} onPress={() => change({ mode })} style={[styles.mode, draft.mode === mode && styles.selectedMode]}><View style={styles.between}><Image source={mode === 'express' ? require('../../assets/express-delivery.png') : require('../../assets/standard-delivery.png')} resizeMode="contain" style={styles.modeIcon} />{draft.mode === mode && <Ionicons name="checkmark-circle" size={19} color={colors.navy} />}</View><Text translate style={styles.modeTitle}>{mode === 'express' ? 'Express' : 'Standard'}</Text><Text translate style={styles.small}>{mode === 'express' ? 'Priority delivery' : 'Everyday deliveries'}</Text><Text translate style={styles.modePrice}>{route.route ? formatXaf(deliveryFare(route.route.distanceMeters, mode)) : 'Select your route'}</Text></Pressable>)}</View>
          </>}
          {step === 1 && <DeliveryDetailsForm draft={draft} onChange={change} />}
          {step === 2 && <>
            <View style={styles.fareCard}><Text translate style={styles.small}>{draft.mode === 'express' ? 'Express delivery' : 'Standard delivery'}</Text><Text translate style={styles.fare}>{formatXaf(fare)}</Text><Text translate style={styles.small}>{route.route ? `${(route.route.distanceMeters / 1000).toFixed(1)} km · About ${Math.max(1, Math.round(route.route.durationSeconds / 60))} min driving` : 'Driving route'}</Text></View>
            <StopRows draft={draft} onEdit={key => { setStep(0); setPicker(key); }} />
            <View style={styles.infoCard}><View style={styles.between}><Text translate style={styles.sectionTitle}>{draft.description}</Text><Pressable accessibilityRole="button" accessibilityLabel="Edit package details" onPress={() => setStep(1)}><Ionicons name="create-outline" size={21} color={colors.primary} /></Pressable></View><Text translate style={styles.small}>{draft.size[0].toUpperCase() + draft.size.slice(1)} package</Text><Text translate style={styles.small}>From {draft.senderName}{!receiving ? ' (you)' : ''} · {draft.senderPhone}</Text><Text translate style={styles.small}>To {draft.recipientName}{receiving ? ' (you)' : ''} · {draft.recipientPhone}</Text><PackagePhotoPreview photo={draft.photo} /></View>
            <View style={styles.walletRow}><Ionicons name="wallet-outline" size={23} color={colors.primary} /><View style={styles.flex}><Text translate style={styles.sectionTitle}>Zipp Wallet</Text><Text translate style={styles.small}>{formatXaf(wallet.available)} available</Text></View><Ionicons name={wallet.available >= fare ? 'checkmark-circle' : 'alert-circle-outline'} size={23} color={wallet.available >= fare ? colors.primary : colors.error} /></View>
          </>}
          {Boolean(error) && <Text translate accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </> : processing ? <View style={[styles.processing, { minHeight: sheet.collapsedHeight - 40 }]}><View style={styles.spinner}><ActivityIndicator size="large" color={colors.primary} /></View><Text translate style={styles.title}>Processing payment</Text><Text translate style={styles.fare}>{formatXaf(session?.fare ?? fare)}</Text><Text translate style={styles.small}>Paying from your Zipp Wallet</Text></View>
          : finished && session ? <DeliveryReceipt draft={draft} session={session} distance={route.route?.distanceMeters} rating={rating} feedback={feedback} onRating={setRating} onFeedback={setFeedback} />
          : session ? <DeliveryTracking draft={draft} session={session} eta={eta} onContact={() => setPanel('contact')} onCall={callCourier} onShare={() => { void shareDelivery(); }} onSharePin={() => { void shareDelivery(true); }} onSupport={() => setPanel('support')} /> : null}
      </ScrollView>
    </Animated.View>
    {!mapKey && !processing && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {!active ? <><Text translate style={styles.footerNote}>{step === 2 ? `Pay with Zipp Wallet · ${formatXaf(wallet.available)} available` : step === 0 ? 'Pickup and drop-off · Door to door' : 'Make collection and handover easy'}</Text><ActionButton accessibilityLabel={step === 2 ? 'Confirm delivery' : 'Continue delivery booking'} onPress={next}>{step === 2 ? wallet.available < fare ? 'Top up to book' : 'Confirm delivery' : 'Continue'}</ActionButton></>
        : phase === 'delivered' && !session?.paid ? <ActionButton accessibilityLabel="Retry delivery payment" onPress={() => { if (session && !applyEvent({ type: 'payment_received', deliveryId: session.id })) setPanel('wallet'); }}>Pay {formatXaf(session?.fare ?? fare)}</ActionButton>
        : phase === 'delivered' ? <><ActionButton accessibilityLabel="Submit delivery rating" disabled={!rating} onPress={() => { if (session) applyEvent({ type: 'rated', deliveryId: session.id, rating, feedback }); }}>Submit rating</ActionButton><Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.secondary}><Text translate style={styles.small}>Skip for now</Text></Pressable></>
        : phase === 'rated' ? <ActionButton accessibilityLabel="Back to Home" onPress={() => navigation.goBack()}>Back to Home</ActionButton>
        : <><ActionButton accessibilityLabel="Share delivery details" onPress={() => { void shareDelivery(); }}>Share delivery</ActionButton><Pressable accessibilityRole="button" onPress={() => setPanel(cancelable ? 'cancel' : 'support')} style={styles.secondary}><Text translate style={styles.secondaryText}>{cancelable ? 'Cancel delivery' : 'Help with this delivery'}</Text></Pressable></>}
    </View>}
    <PlacePickerSheet visible={picker !== null} title={picker === 'pickup' ? 'Where from?' : 'Where to?'} value={picker ? draft[picker] : undefined} saved={saved} onClose={() => setPicker(null)} onSelect={selectStop} onMap={openMap} locating={locating} onLocate={picker ? () => locateFor(picker) : undefined} />
    {mapKey && <KeyboardAvoidingView pointerEvents="box-none" style={styles.mapCardOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={[styles.mapCardMargin, { marginBottom: Math.max(16, insets.bottom) }]}><MapStopCard title={mapKey === 'pickup' ? 'Pickup location' : 'Drop-off location'} value={mapDraft} maxHeight={Math.max(220, screenHeight - insets.top - (Platform.OS === 'ios' ? keyboardHeight : 0) - 100)} saved={mapSaved} onSelect={setMapDraft} onDone={finishMap} onSave={saveMap} onHeight={setMapHeight} /></View></KeyboardAvoidingView>}
    <Modal transparent visible={panel !== null} animationType="slide" onRequestClose={() => setPanel(null)}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close panel" onPress={() => setPanel(null)} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.panel, { paddingBottom: Math.max(20, insets.bottom), maxHeight: height - insets.top - 24 }]}><View style={styles.handle} /><View style={styles.between}><Text translate style={styles.panelTitle}>{panel === 'cancel' ? 'Cancel delivery?' : panel === 'wallet' ? 'Top up your wallet' : panel === 'simulation' ? 'Delivery simulation' : panel === 'call' ? 'Call courier' : panel === 'contact' ? 'Keep in touch' : 'Delivery support'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setPanel(null)} style={styles.close}><Ionicons name="close" size={23} color={colors.navy} /></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
            {panel === 'call' && <><View style={styles.infoCard}><Ionicons name="call-outline" size={28} color={colors.primary} /><Text translate style={styles.sectionTitle}>Contact Michael</Text><Text translate style={styles.small}>{session?.courierPhone ? 'Couldn’t open the phone app. Please try again.' : 'The courier’s phone number is unavailable. You can keep a message for your courier.'}</Text></View><ActionButton accessibilityLabel="Open courier message" onPress={() => setPanel('contact')}>Message courier</ActionButton></>}
            {panel === 'cancel' && <><View style={styles.infoCard}><Text translate style={styles.sectionTitle}>Your package hasn’t been collected</Text><Text translate style={styles.small}>Cancel now and the full {formatXaf(session?.fare ?? 0)} reserved for this delivery will return to your available balance.</Text><Text translate style={styles.small}>Cancellation fee: 0 XAF</Text></View><ActionButton accessibilityLabel="Keep delivery" onPress={() => setPanel(null)}>Keep delivery</ActionButton><Pressable accessibilityRole="button" onPress={() => { if (session) applyEvent({ type: 'canceled', deliveryId: session.id }); }} style={styles.secondary}><Text translate style={styles.error}>Cancel delivery</Text></Pressable></>}
            {panel === 'wallet' && <><Text translate style={styles.sectionTitle}>Your wallet needs to cover the full delivery fare.</Text><View style={styles.infoCard}><Text translate style={styles.small}>Available balance: {formatXaf(wallet.available)}</Text><Text translate style={styles.small}>Delivery fare: {formatXaf(session?.fare ?? fare)}</Text><Text translate style={styles.sectionTitle}>Amount to add: {formatXaf(Math.max(0, (session?.fare ?? fare) - wallet.available))}</Text></View>{!active && <ActionButton accessibilityLabel="Open wallet top up" onPress={() => { setPanel(null); navigation.navigate('RoleHome', { openWallet: true }); }}>Top up wallet</ActionButton>}</>}
            {(panel === 'contact' || panel === 'support') && <>
              <Text translate style={styles.small}>{panel === 'support' ? cancelable ? 'Let us know what happened with your delivery.' : 'Your package is with the courier. Delivery changes and returns need support review.' : receiving ? 'Coordinate collection with the sender or message your courier.' : 'Coordinate pickup or let the recipient know the courier is close.'}</Text>
              {(receiving ? draft.senderPhone : draft.recipientPhone) && <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL(`tel:${(receiving ? draft.senderPhone : draft.recipientPhone).replace(/[^+\d]/g, '')}`); }} style={styles.contactRow}><Ionicons name="call-outline" size={22} color={colors.primary} /><Text translate style={styles.sectionTitle}>Call {receiving ? 'sender' : 'recipient'} · {receiving ? draft.senderName : draft.recipientName}</Text></Pressable>}
              <Pressable accessibilityRole="button" onPress={() => { void shareDelivery(); }} style={styles.contactRow}><Ionicons name="share-social-outline" size={22} color={colors.primary} /><Text translate style={styles.sectionTitle}>Share delivery details</Text></Pressable>
              <TextInput accessibilityLabel={panel === 'support' ? 'Delivery issue details' : 'Message to courier'} value={panel === 'support' ? supportNote : message} onChangeText={panel === 'support' ? setSupportNote : setMessage} placeholder={panel === 'support' ? 'Describe the delivery issue or return request…' : 'Message your courier…'} placeholderTextColor={colors.secondaryText} style={styles.notesInput} multiline maxLength={500} />
              <ActionButton accessibilityLabel="Keep delivery note" onPress={() => setPanel(null)}>Keep note</ActionButton>
            </>}
            {__DEV__ && panel === 'simulation' && <><View style={styles.simulationHero}><Image source={require('../../assets/delivery-button.png')} style={styles.simulationIcon} resizeMode="contain" /><View style={styles.flex}><Text translate style={styles.sectionTitle}>{phase === 'at_pickup' ? 'Collect the package' : phase === 'in_transit' ? 'Package on the way' : phase === 'at_dropoff' ? 'Confirm the handover' : 'Courier approaching'}</Text><Text translate style={styles.small}>{phase === 'at_pickup' ? 'Simulate the courier confirming collection.' : phase === 'at_dropoff' ? 'Simulate the courier verifying the recipient PIN after handover.' : 'The map journey runs for 10 seconds.'}</Text></View></View><Text translate style={styles.small}>Development events only. Live handover and PIN verification belong to the courier and server.</Text><ActionButton accessibilityLabel="Advance simulated delivery event" onPress={simulateNext}>{phase === 'at_pickup' ? 'Package collected' : phase === 'at_dropoff' ? 'Recipient PIN verified' : phase === 'in_transit' ? 'Courier at drop-off' : 'Courier at pickup'}</ActionButton></>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

function StopRows({ draft, onEdit }: { draft: DeliveryDraft; onEdit: (key: StopKey) => void }) {
  return <View style={styles.stops}>{(['pickup', 'dropoff'] as const).map((key, index) => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Edit ${key}`} onPress={() => onEdit(key)} style={[styles.stopRow, index === 0 && styles.stopDivider]}><View style={styles.stopIcon}>{index === 0 ? <Ionicons name="radio-button-on" size={21} color={colors.primary} /> : <Image source={require('../../assets/location.png')} resizeMode="contain" style={styles.icon} />}</View><View style={styles.flex}><Text translate style={styles.stopLabel}>{index === 0 ? draft.perspective === 'receiving' ? 'PICKUP · SENDER' : 'PICKUP · YOU' : draft.perspective === 'receiving' ? 'DROP-OFF · YOU' : 'DROP-OFF · RECIPIENT'}</Text><Text translate numberOfLines={2} style={styles.stopText}>{draft[key]?.label ?? (index === 0 ? draft.perspective === 'receiving' ? 'Where should we collect your package?' : 'Your collection location' : draft.perspective === 'receiving' ? 'Your delivery location' : 'Recipient’s delivery location')}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.secondaryText} /></Pressable>)}</View>;
}
function RouteInfo({ status, distance, duration, retry }: { status: string; distance?: number; duration?: number; retry: () => void }) {
  return status === 'loading' ? <View style={styles.tip}><ActivityIndicator size="small" color={colors.primary} /><Text translate style={styles.small}>Finding your delivery route…</Text></View> : status === 'error' ? <Pressable accessibilityRole="button" onPress={retry} style={styles.tip}><Ionicons name="refresh" size={18} color={colors.primary} /><Text translate style={styles.small}>No route found. Tap to retry or adjust locations.</Text></Pressable> : distance !== undefined ? <View style={styles.tip}><Ionicons name="navigate-outline" size={18} color={colors.primary} /><Text translate style={styles.small}>{(distance / 1000).toFixed(1)} km · About {Math.max(1, Math.round((duration ?? 0) / 60))} min driving</Text></View> : null;
}

const styles = StyleSheet.create({
  selfLocation: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.iconBackground },
  selfLocationText: { lineHeight: 23, flexShrink: 1, fontSize: 15, fontWeight: '500', color: colors.primary },
  stopIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  modeIcon: { width: 42, height: 42 },
  sheetBack: { alignSelf: 'flex-start', minHeight: 40, paddingHorizontal: 13, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.input },
  sheetBackText: { fontSize: 12, fontWeight: '500', color: colors.navy },
  screen: { flex: 1, backgroundColor: colors.white }, flex: { flex: 1 }, header: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, circle: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: colors.navy, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }, spacer: { width: 46 }, headerTitle: { borderRadius: 24, backgroundColor: colors.white, paddingHorizontal: 18, paddingVertical: 12 }, headerText: { fontSize: 13, fontWeight: '600', color: colors.navy }, mapHint: { flex: 1, padding: 15, borderRadius: 18, backgroundColor: colors.white, fontSize: 12, fontWeight: '500', color: colors.navy }, locate: { position: 'absolute', right: 20 }, icon: { width: 24, height: 24 }, sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: colors.white, shadowColor: colors.navy, shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 8 }, handleArea: { height: 28, alignItems: 'center', justifyContent: 'center' }, handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' }, content: { paddingHorizontal: 20, gap: 16 }, title: { fontSize: 23, fontWeight: '700', color: colors.navy }, sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.navy }, small: { fontSize: 11, lineHeight: 19, fontWeight: '500', color: colors.secondaryText }, stops: { paddingHorizontal: 18, paddingVertical: 4, borderRadius: 22, backgroundColor: colors.input }, stopRow: { minHeight: 82, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, stopDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, stopLabel: { marginBottom: 4, lineHeight: 17, fontSize: 11, letterSpacing: 1, fontWeight: '600', color: colors.secondaryText }, stopText: { lineHeight: 26, fontSize: 17, fontWeight: '500', color: colors.navy }, modeRow: { flexDirection: 'row', gap: 12 }, mode: { flex: 1, minHeight: 160, borderRadius: 21, padding: 16, backgroundColor: colors.input, gap: 8 }, selectedMode: { backgroundColor: colors.yellow }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, modeTitle: { fontSize: 17, fontWeight: '600', color: colors.navy }, modePrice: { marginTop: 5, fontSize: 14, fontWeight: '600', color: colors.navy }, tip: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 }, fareCard: { padding: 20, borderRadius: 22, backgroundColor: colors.input, gap: 8 }, fare: { fontSize: 28, fontWeight: '700', color: colors.navy }, infoCard: { padding: 17, borderRadius: 20, backgroundColor: colors.input, gap: 10 }, walletRow: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, backgroundColor: colors.input }, error: { fontSize: 12, lineHeight: 20, fontWeight: '500', color: colors.error }, processing: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 30 }, spinner: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, footerNote: { fontSize: 10, fontWeight: '500', color: colors.secondaryText, textAlign: 'center', marginBottom: 9 }, secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, secondaryText: { fontSize: 14, fontWeight: '500', color: colors.secondaryText }, mapCardOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'flex-end' }, mapCardMargin: { marginHorizontal: 16 }, modalRoot: { flex: 1, justifyContent: 'flex-end' }, backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(18,27,38,0.35)' }, panel: { flexShrink: 1, maxHeight: '100%', padding: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.white, gap: 14 }, panelTitle: { fontSize: 21, fontWeight: '700', color: colors.navy, flex: 1 }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, panelContent: { gap: 14 }, contactRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 17, backgroundColor: colors.input }, notesInput: { minHeight: 105, padding: 15, borderRadius: 17, backgroundColor: colors.input, textAlignVertical: 'top', fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.navy }, simulationHero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: 21, backgroundColor: colors.input }, simulationIcon: { width: 62, height: 62 },
});
