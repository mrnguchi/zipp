import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { ActionButton } from './ActionButton';
import { colors } from '../constants/colors';
import type { RidePhase } from '../services/rideEvents';
type Props = { phase: RidePhase; onNext: () => void };
export function RideSimulationControls({ phase, onNext }: Props) {
  const index = phase === 'arriving' ? 0 : phase === 'arrived' ? 1 : phase === 'in_progress' ? 2 : 3;
  const titles = ['Driver on the way', 'Ready to begin', 'Enjoy the journey', 'Journey complete'];
  return <View style={styles.content}>
    <View style={styles.hero}><Image source={require('../../assets/driver car.png')} resizeMode="contain" style={styles.car} /><View style={styles.copy}><Text style={styles.title}>{titles[index]}</Text><Text style={styles.caption}>{index === 0 ? 'The driver reaches pickup after 10 seconds.' : index === 1 ? 'Verify the trip PIN to begin the test ride.' : index === 2 ? 'This ride ends automatically after 10 seconds.' : 'Open the receipt and rate your ride.'}</Text></View></View>
    <View style={styles.steps}>{['Pickup', 'PIN', 'Ride', 'Receipt'].map((label, step) => <View key={label} style={styles.step}><View style={[styles.dot, step <= index && styles.activeDot]}>{step < index ? <Ionicons name="checkmark" size={15} color={colors.white} /> : <Text style={[styles.number, step === index && { color: colors.white }]}>{step + 1}</Text>}</View><Text style={[styles.label, step === index && { color: colors.navy }]}>{label}</Text></View>)}</View>
    <View style={styles.detail}><Image source={require('../../assets/shield.png')} resizeMode="contain" style={{ width: 20, height: 20 }} /><Text style={styles.caption}>Test controls only. On a live ride, the driver verifies your PIN and updates the trip status.</Text></View>
    {index < 3 && <ActionButton accessibilityLabel={index === 0 ? 'Simulate driver arrival' : index === 1 ? 'Simulate driver PIN verification and start ride' : 'Close ride simulation'} onPress={onNext}>{index === 0 ? 'Driver has arrived' : index === 1 ? 'Verify PIN & start ride' : 'Back to your ride'}</ActionButton>}
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 22 }, hero: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.input, padding: 18, borderRadius: 22 }, car: { width: 66, height: 66 }, copy: { flex: 1, gap: 5 }, title: { fontSize: 17, fontWeight: '600', color: colors.navy }, caption: { flexShrink: 1, fontSize: 12, lineHeight: 20, fontWeight: '500', color: colors.secondaryText }, steps: { flexDirection: 'row', justifyContent: 'space-between' }, step: { alignItems: 'center', gap: 8, flex: 1 }, dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.input }, activeDot: { backgroundColor: colors.primary }, number: { fontSize: 12, fontWeight: '600', color: colors.secondaryText }, label: { fontSize: 10, fontWeight: '500', color: colors.secondaryText }, detail: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});
