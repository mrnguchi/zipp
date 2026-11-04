import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import { ArrivalDots } from './ArrivalDots';

type Props = { name: string; model: string; image: ImageSourcePropType; pickup: string; destination: string; onMessage: () => void; onCall: () => void; arrivalLabel: string; phase?: 'arriving' | 'arrived' | 'in_progress'; pin?: string; onShare?: () => void; onSafety?: () => void };

export function RideDriverDetails({ name, model, image, pickup, destination, onMessage, onCall, arrivalLabel, phase = 'arriving', pin = '', onShare, onSafety }: Props) {
  return <View style={styles.content}>
    <View style={styles.status}><Image source={require('../../assets/driver car.png')} resizeMode="contain" style={styles.arrivalCar} /><View style={styles.arrivalCopy}><View style={styles.arrivalHeading}><Text style={styles.arrivalText}>{phase === 'arrived' ? 'Your driver is here' : phase === 'in_progress' ? 'You’re on your way' : 'Driver arriving'}</Text>{phase === 'arriving' && <ArrivalDots />}</View><Text style={styles.arrivalEstimate}>{phase === 'arrived' ? 'Meet at your pickup location' : arrivalLabel}</Text></View></View>
    {phase === 'arrived' && <View style={styles.pinCard}><View style={styles.pinHeading}><Image source={require('../../assets/shield.png')} resizeMode="contain" style={{ width: 21, height: 21 }} /><Text style={styles.pinTitle}>Your trip PIN</Text></View><Text style={styles.pinCopy}>Check the number plate and get inside before sharing this PIN with your driver.</Text><View style={styles.pinDigits} accessibilityLabel={`Trip PIN ${pin.split('').join(' ')}`}>{pin.split('').map((digit, index) => <View key={index} style={styles.pinDigit}><Text style={styles.pinNumber}>{digit}</Text></View>)}</View><Text style={styles.pinHint}>Your ride starts after your driver verifies the PIN.</Text></View>}
    {phase === 'in_progress' && <View style={styles.journeyActions}><Pressable accessibilityRole="button" onPress={onShare} style={styles.journeyAction}><Ionicons name="share-social-outline" size={21} color={colors.primary} /><Text style={styles.name}>Share trip</Text></Pressable><Pressable accessibilityRole="button" onPress={onSafety} style={styles.journeyAction}><Image source={require('../../assets/shield.png')} resizeMode="contain" style={{ width: 21, height: 21 }} /><Text style={styles.name}>Safety</Text></Pressable></View>}
    <Text style={styles.title}>Meet your driver</Text>
    <View style={styles.card}>
      <View style={styles.vehicle}>
        <View style={styles.vehicleText}><Text style={styles.badge}>{name}</Text><Text style={styles.plate}>SW 681 BS</Text><Text style={styles.caption}>{model} · White</Text></View>
        <Image source={image} resizeMode="contain" style={styles.car} />
      </View>
      <View style={styles.driver}>
        <View style={styles.avatar}><Ionicons name="person" size={27} color={colors.primary} /></View>
        <View style={styles.flex}><Text style={styles.name}>Alex</Text><View style={styles.rating}><Ionicons name="star" size={12} color={colors.yellow} /><Text style={styles.caption}>4.9 · 320 trips</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Message driver" onPress={onMessage} style={styles.contact}><Ionicons name="chatbubble-ellipses" size={20} color={colors.navy} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Call driver" onPress={onCall} style={styles.contact}><Ionicons name="call" size={20} color={colors.navy} /></Pressable>
      </View>
    </View>
    <View style={styles.route}>
      <View style={styles.routeRow}><Ionicons name="radio-button-on" size={18} color={colors.primary} /><View style={styles.flex}><Text style={styles.caption}>Pickup</Text><Text style={styles.location}>{pickup}</Text></View></View>
      <View style={styles.routeRow}><Ionicons name="location" size={18} color={colors.primary} /><View style={styles.flex}><Text style={styles.caption}>Destination</Text><Text style={styles.location}>{destination}</Text></View></View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  pinCard: { backgroundColor: colors.input, borderRadius: 22, padding: 18, gap: 12 },
  pinHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinTitle: { fontSize: 15, fontWeight: '600', color: colors.navy },
  pinCopy: { fontSize: 12, lineHeight: 20, fontWeight: '500', color: colors.secondaryText },
  pinDigits: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginVertical: 4 },
  pinDigit: { width: 52, minHeight: 58, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  pinNumber: { fontSize: 27, fontWeight: '700', color: colors.navy },
  pinHint: { fontSize: 10, lineHeight: 17, fontWeight: '500', color: colors.secondaryText, textAlign: 'center' },
  journeyActions: { flexDirection: 'row', gap: 12 },
  journeyAction: { flex: 1, minHeight: 54, borderRadius: 18, backgroundColor: colors.input, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrivalCar: { width: 58, height: 58 },
  arrivalCopy: { flex: 1, gap: 5 },
  arrivalHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  arrivalText: { fontSize: 15, fontWeight: '600', color: colors.navy },
  arrivalEstimate: { fontSize: 12, lineHeight: 19, fontWeight: '500', color: colors.secondaryText },
  flex: { flex: 1 },
  status: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 90, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.input },
  title: { fontSize: 20, fontWeight: '700', color: colors.navy },
  caption: { fontSize: 10, lineHeight: 17, fontWeight: '500', color: colors.secondaryText },
  card: { backgroundColor: colors.input, borderRadius: 22, padding: 16 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 20 },
  vehicleText: { flex: 1 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: colors.white, fontSize: 10, fontWeight: '600', color: colors.navy },
  plate: { fontSize: 23, fontWeight: '700', color: colors.navy, marginTop: 8 },
  car: { width: '44%', height: 100 },
  driver: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 18 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 12, fontWeight: '600', color: colors.navy },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  contact: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  route: { backgroundColor: colors.input, borderRadius: 18, padding: 16, gap: 18 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  location: { fontSize: 12, fontWeight: '500', color: colors.navy },
});
