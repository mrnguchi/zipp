import {LocalizedPressable as Pressable} from './LocalizedNative';
import {Modal, ScrollView, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import { ActionButton } from './ActionButton';
import { colors } from '../constants/colors';
import { formatXaf } from '../utils/formatCurrency';

type Props = { visible: boolean; fare: number; onClose: () => void; onConfirm: () => void };
export function CancelRideModal({ visible, fare, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const fee = Math.round(fare * 0.25);
  return <Modal transparent visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Keep ride and close" onPress={onClose} style={styles.backdrop} />
      <View accessibilityViewIsModal style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close cancellation" onPress={onClose} style={styles.close}><Ionicons name="close" size={22} color={colors.navy} /></Pressable>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.icon}><Ionicons name="car-sport-outline" size={32} color={colors.navy} /></View>
          <Text translate style={styles.title}>Cancel your ride?</Text>
          <Text translate style={styles.copy}>Your driver is on the way. If you cancel, a fee of 25% of your ride fare will be charged to your Zipp Wallet.</Text>
          <View style={styles.summary}>
            <View style={styles.row}><Text translate style={styles.label}>Ride fare</Text><Text translate style={styles.value}>{formatXaf(fare)}</Text></View>
            <View style={styles.row}><Text translate style={styles.label}>Cancellation rate</Text><Text translate style={styles.value}>25%</Text></View>
            <View style={[styles.row, styles.total]}><Text translate style={styles.totalLabel}>Wallet charge</Text><Text translate style={styles.amount}>{formatXaf(fee)}</Text></View>
          </View>
          <ActionButton accessibilityLabel="Keep my ride" onPress={onClose}>Keep my ride</ActionButton>
          <Pressable accessibilityRole="button" accessibilityLabel={`Cancel ride and accept a ${formatXaf(fee)} wallet charge`} onPress={onConfirm} style={styles.cancel}><Text translate style={styles.cancelText}>Cancel ride · {formatXaf(fee)}</Text></Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(18,27,38,0.45)' },
  card: { maxHeight: '100%', borderRadius: 28, padding: 22, backgroundColor: colors.white },
  close: { alignSelf: 'flex-end', width: 36, height: 36, borderRadius: 18, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 16 },
  icon: { alignSelf: 'center', width: 64, height: 64, borderRadius: 22, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.navy, textAlign: 'center' },
  copy: { fontSize: 13, lineHeight: 22, fontWeight: '500', color: colors.secondaryText, textAlign: 'center' },
  summary: { borderRadius: 18, padding: 16, backgroundColor: colors.input, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  label: { fontSize: 12, fontWeight: '500', color: colors.secondaryText },
  value: { fontSize: 12, fontWeight: '600', color: colors.navy },
  total: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  totalLabel: { fontSize: 13, fontWeight: '600', color: colors.navy },
  amount: { fontSize: 20, fontWeight: '700', color: colors.navy },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: colors.error, textAlign: 'center' },
});
