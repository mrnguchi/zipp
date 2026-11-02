import { useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { NotificationList } from '../components/NotificationList';
import { useWallet } from '../contexts/WalletContext';
import { AppText as Text } from '../components/AppText';
import { RideMap } from '../components/maps/RideMap';
import { colors } from '../constants/colors';
import { profileDisplayName, useProfile } from '../contexts/ProfileContext';
import { useHomeSheet } from '../hooks/useHomeSheet';
import { useMyLocation } from '../hooks/useMyLocation';
import type { RootStackParamList } from '../navigation/types';

type Panel = 'wallet' | 'topup' | 'delivery' | 'notifications' | 'places' | null;
type Place = 'Home' | 'Work';
type Props = { contentBottomInset?: number; onOpenActivity: () => void };
const titles = { wallet: 'Your wallet', topup: 'Top up your wallet', delivery: 'Send a delivery', notifications: 'Notifications', places: 'Saved places' };
// Trip count remains a fixture; wallet funds come from shared session state.
const previewSummary = { weeklyTrips: 12 };
const messages = {
  wallet: 'Keep track of your balance and ride payments in one place.',
  topup: 'Add money to your Zipp Wallet with MTN MoMo or Orange Money.',
  delivery: 'Send a package with Standard or Express delivery.',
  notifications: 'You’re all caught up. Check here for ride and payment updates.',
};

export function RoleHomeScreen({ contentBottomInset = 24, onOpenActivity }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'RoleHome'>>();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [screenHeight, setScreenHeight] = useState(height);
  const sheet = useHomeSheet(screenHeight, insets.top, 0.46);
  const { locating, locationFocus, locate } = useMyLocation();
  const { profile } = useProfile();
  const displayName = profileDisplayName(profile) || 'Nguchi';
  const wallet = useWallet();
  const [panel, setPanel] = useState<Panel>(null);
  useEffect(() => {
    if (route.params?.openWallet) {
      setPanel('topup'); navigation.setParams({ openWallet: false });
    }
  }, [route.params?.openWallet, navigation]);
  const [places, setPlaces] = useState<Record<Place, string>>({ Home: '', Work: '' });
  const [draft, setDraft] = useState(places);
  const [hidden, setHidden] = useState(false);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Douala' }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,';
  const openPlaces = () => { setDraft(places); setPanel('places'); };
  const bookRide = () => navigation.navigate('BookRide', { focusDestination: true });

  return <View style={styles.screen} onLayout={event => { if (event.nativeEvent.layout.height > 0) setScreenHeight(event.nativeEvent.layout.height); }}>
    <StatusBar style="dark" />
      <View style={styles.mapSection}>
        <RideMap bottomInset={0} attributionBottomInset={sheet.expandedHeight} overlayTranslateY={sheet.translateY} cameraBottomInset={sheet.expanded ? sheet.expandedHeight : sheet.collapsedHeight} locationFocus={locationFocus} topInset={insets.top + 148} showControls={false} />
      </View>
      <View pointerEvents="box-none" style={[styles.homeTop, { paddingTop: insets.top + 12 }]}>
      <View pointerEvents="none" style={styles.headerBackground} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}><Text style={styles.greeting}>{greeting}</Text>{displayName && <Text style={styles.welcome} numberOfLines={1}>{displayName} 👋</Text>}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => setPanel('notifications')} style={styles.notificationButton}><Ionicons name="notifications" size={27} color={colors.navy} /></Pressable>
      </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Where to? Book a ride" onPress={bookRide} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
          <Image source={require('../../assets/location.png')} resizeMode="contain" style={styles.locationIcon} /><Text style={styles.searchText}>Where to?</Text>
        </Pressable>
      </View>
      <Animated.View pointerEvents={sheet.expanded ? 'none' : 'box-none'} style={[styles.mapButtons, { bottom: sheet.expandedHeight + 34, transform: [{ translateY: sheet.translateY }], opacity: sheet.translateY.interpolate({ inputRange: [0, Math.max(1, sheet.travel * 0.7), Math.max(2, sheet.travel)], outputRange: [0, 0, 1], extrapolate: 'clamp' }) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="My location" accessibilityState={{ busy: locating, disabled: locating }} disabled={locating} onPress={() => { void locate(); }} style={styles.roundButton}>
          {locating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="locate-outline" size={20} color={colors.primary} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open ride map" onPress={() => navigation.navigate('BookRide')} style={styles.roundButton}><Ionicons name="expand-outline" size={20} color={colors.primary} /></Pressable>
      </Animated.View>
      <Animated.View style={[styles.homeSheet, { height: sheet.expandedHeight, transform: [{ translateY: sheet.translateY }] }]}>
        <View {...sheet.panHandlers}>
          <Pressable accessibilityRole="button" accessibilityLabel={sheet.expanded ? 'Collapse home sheet' : 'Expand home sheet'} accessibilityState={{ expanded: sheet.expanded }} onPress={() => sheet.snap(!sheet.expanded)} style={styles.sheetHandleArea}><View style={styles.panelHandle} /></Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.body, { paddingBottom: contentBottomInset + (sheet.expanded ? 0 : sheet.travel) }]}>
        <View style={styles.row}>
          <View style={styles.summaryCard}>
            <View style={styles.between}><Text style={styles.caption}>Wallet balance</Text><Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'} onPress={() => setHidden(value => !value)} hitSlop={8} style={{ padding: 4 }}><Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={15} color={colors.secondaryText} /></Pressable></View>
            <View style={styles.balanceRow}><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.stat, styles.balanceAmount]}>{hidden ? '••••' : wallet.available.toLocaleString('en-GB')}</Text><Text style={styles.currency}>XAF</Text></View>
            <Pressable accessibilityRole="button" onPress={() => setPanel('topup')} style={styles.topup}><Text style={styles.topupPlus}>+</Text><Text style={styles.topupText}>Top up</Text></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="View trip activity" onPress={onOpenActivity} style={({ pressed }) => [styles.summaryCard, pressed && styles.pressed]}>
            <View style={styles.between}><Text style={styles.caption}>Trips</Text><Ionicons name="chevron-forward" size={15} color={colors.secondaryText} /></View><Text style={[styles.stat, styles.tripCount]}>{previewSummary.weeklyTrips}</Text><Text style={styles.period}>This week</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          {([
            { label: 'Ride', image: require('../../assets/ride.png'), action: () => navigation.navigate('BookRide') },
            { label: 'Delivery', image: require('../../assets/delivery-button.png'), action: () => setPanel('delivery') },
            { label: 'Wallet', image: require('../../assets/wallet.png'), action: () => setPanel('wallet') },
          ] as const).map(item => <Pressable key={item.label} accessibilityRole="button" onPress={item.action} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Image source={item.image} resizeMode="contain" style={styles.actionIcon} /><Text style={styles.actionText}>{item.label}</Text></Pressable>)}
        </View>
        <View>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Saved Places</Text><Pressable accessibilityRole="button" onPress={openPlaces} style={styles.seeAll}><Text style={styles.smallText}>See all</Text><Ionicons name="chevron-forward" size={13} color={colors.secondaryText} /></Pressable></View>
          <View style={styles.savedCard}>
            {(['Home', 'Work'] as const).map((place, index) => <Pressable key={place} accessibilityRole="button" accessibilityLabel={places[place] ? `Book a ride to ${place}, ${places[place]}` : `Add ${place.toLowerCase()} address`} onPress={() => places[place] ? navigation.navigate('BookRide', { destinationLabel: places[place], focusDestination: true }) : openPlaces()} style={({ pressed }) => [styles.savedRow, index === 1 && styles.divider, pressed && styles.pressed]}>
              <View style={styles.placeIcon}><Ionicons name={place === 'Home' ? 'home' : 'briefcase'} size={19} color={colors.primary} /></View><View style={{ flex: 1, gap: 2 }}><Text style={styles.placeName}>{place}</Text><Text style={styles.smallText} numberOfLines={1}>{places[place] || `Add ${place.toLowerCase()} address`}</Text></View><Ionicons name={places[place] ? 'chevron-forward' : 'add'} size={17} color={places[place] ? "#929B99" : colors.yellow} />
            </Pressable>)}
          </View>
        </View>
        <View>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Earn with Zipp</Text></View>
          <View style={styles.row}>
            {([
              { role: 'driver', image: require('../../assets/how to be a driver.png') },
              { role: 'rider', image: require('../../assets/how to be a rider.png') },
            ] as const).map(({ role, image }) => <Pressable key={role} accessibilityRole="button" accessibilityLabel={`How to be a Zipp ${role}`} onPress={() => navigation.navigate('RoleGuide', { role })} style={({ pressed }) => [styles.joinCard, pressed && styles.pressed]}>
              <Image source={image} resizeMode="cover" style={styles.joinImage} /><View style={[styles.joinOverlay, role === 'driver' && { backgroundColor: 'rgba(13,24,37,0.46)' }]} /><View style={styles.joinContent}><Text style={styles.joinTitle}>How to be a{'\n'}Zipp {role}</Text><View style={styles.joinCta}><Ionicons name="arrow-forward" size={16} color={colors.navy} style={{ transform: [{ rotate: '-45deg' }] }} /></View></View>
            </Pressable>)}
          </View>
        </View>
        </ScrollView>
      </Animated.View>
    <Modal transparent visible={panel !== null} animationType="slide" onRequestClose={() => setPanel(null)}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close panel" onPress={() => setPanel(null)} style={styles.backdrop} />
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 24) }]} accessibilityViewIsModal>
          <View style={styles.panelHandle} /><View style={styles.between}><Text style={styles.panelTitle}>{panel && titles[panel]}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setPanel(null)} style={styles.roundButton}><Ionicons name="close" size={22} color={colors.navy} /></Pressable></View>
          {panel === 'places' ? <>
            <Text style={styles.panelCopy}>Add your usual landmarks for quicker booking. These shortcuts are kept for this app session.</Text>
            {(['Home', 'Work'] as const).map(place => <View key={place} style={{ gap: 6 }}><Text style={styles.placeName}>{place}</Text><TextInput accessibilityLabel={`${place} address`} value={draft[place]} onChangeText={text => setDraft(current => ({ ...current, [place]: text }))} placeholder={`Enter ${place.toLowerCase()} address or landmark`} placeholderTextColor="#8C9693" style={styles.addressInput} maxLength={160} /></View>)}
            <ActionButton accessibilityLabel="Save places" onPress={() => { setPlaces({ Home: draft.Home.trim(), Work: draft.Work.trim() }); setPanel(null); }}>Save places</ActionButton>
          </> : panel === 'notifications' ? <NotificationList /> : <>
            <View style={styles.panelIcon}><Ionicons name={panel === 'delivery' ? 'cube-outline' : 'wallet-outline'} size={30} color={colors.primary} /></View><Text style={styles.panelCopy}>{panel && messages[panel]}</Text>
            {panel === 'wallet' && <ActionButton accessibilityLabel="Top up" onPress={() => setPanel('topup')}>Top up</ActionButton>}
          </>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, overflow: 'hidden' },
  homeTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, gap: 8 },
  headerBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 31, backgroundColor: colors.white },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  greeting: { fontSize: 18, lineHeight: 27, fontWeight: '500', color: colors.secondaryText },
  welcome: { fontSize: 23, lineHeight: 31, fontWeight: '600', color: colors.navy },
  notificationButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  mapSection: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#F5F5F5' },
  search: { minHeight: 62, borderRadius: 18, backgroundColor: colors.white, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 4 },
  locationIcon: { width: 27, height: 27 },
  searchText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.navy },
  smallText: { fontSize: 11, lineHeight: 18, fontWeight: '500', color: colors.secondaryText },
  mapButtons: { position: 'absolute', right: 24, gap: 10 },
  homeSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: colors.white, shadowColor: colors.navy, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 6 },
  sheetHandleArea: { height: 36, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 24, paddingTop: 2, gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 3 },
  summaryCard: { flex: 1, minWidth: 0, padding: 13, minHeight: 140, borderRadius: 18, backgroundColor: colors.input },
  caption: { fontSize: 11, fontWeight: '500', color: colors.secondaryText, flexShrink: 1 },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  balanceAmount: { flexShrink: 1 },
  stat: { fontSize: 24, lineHeight: 36, fontWeight: '700', color: colors.navy },
  tripCount: { color: colors.yellow },
  currency: { fontSize: 11, fontWeight: '600', color: colors.yellow },
  topup: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, paddingHorizontal: 12, minHeight: 36, borderRadius: 18, backgroundColor: colors.primary, marginTop: 'auto' },
  topupPlus: { fontSize: 19, lineHeight: 24, fontWeight: '700', color: colors.white },
  topupText: { fontSize: 11, fontWeight: '500', color: '#FFFFFF' },
  period: { fontSize: 11, fontWeight: '500', color: '#87918B', marginTop: 'auto' },
  action: { flex: 1, minHeight: 80, borderRadius: 18, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 12, fontWeight: '500', color: colors.navy },
  actionIcon: { width: 32, height: 32 },
  white: { color: '#FFFFFF' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 36 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.navy },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  savedCard: { backgroundColor: colors.input, borderRadius: 20, paddingHorizontal: 16 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E9EEEB' },
  placeIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  placeName: { fontSize: 12, fontWeight: '600', color: colors.navy },
  joinCard: { flex: 1, minWidth: 0, height: 188, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.navy },
  joinImage: { position: 'absolute', width: '100%', height: '100%' },
  joinOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(13,24,37,0.24)' },
  joinContent: { flex: 1, padding: 14, justifyContent: 'space-between' },
  joinTitle: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#FFFFFF' },
  joinCta: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(18,27,38,0.4)' },
  panel: { paddingHorizontal: 24, paddingTop: 12, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 16 },
  panelHandle: { width: 36, height: 4, backgroundColor: '#D9DFDB', borderRadius: 2, alignSelf: 'center' },
  panelTitle: { fontSize: 21, fontWeight: '600', color: colors.navy },
  panelCopy: { fontSize: 13, lineHeight: 22, fontWeight: '500', color: colors.secondaryText },
  panelIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  addressInput: { fontFamily: 'Poppins_500Medium', fontSize: 13, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F3F6F4', color: colors.navy },
});
