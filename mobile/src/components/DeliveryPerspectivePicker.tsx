import {LocalizedPressable as Pressable} from './LocalizedNative';
import {Image, StyleSheet, View} from 'react-native';

import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import type { DeliveryPerspective } from '../services/deliveryFlow';
export function DeliveryPerspectivePicker({ value, onChange }: { value: DeliveryPerspective; onChange: (value: DeliveryPerspective) => void }) {
  return <View style={styles.options}>
    {(['receiving', 'sending'] as const).map(option => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: value === option }} accessibilityLabel={option === 'receiving' ? 'I’m receiving a package' : 'I’m sending a package'} onPress={() => onChange(option)} style={[styles.option, value === option && styles.selected]}><Image source={option === 'receiving' ? require('../../assets/receiving.png') : require('../../assets/sending.png')} resizeMode="contain" style={styles.icon} /><Text translate style={styles.title}>{option === 'receiving' ? 'I’m receiving' : 'I’m sending'}</Text><Text translate style={styles.copy}>{option === 'receiving' ? 'Bring a package to me' : 'Send it to someone else'}</Text></Pressable>)}
  </View>;
}
const styles = StyleSheet.create({
  icon: { width: 36, height: 36 },
  options: { flexDirection: 'row', gap: 12 }, option: { flex: 1, backgroundColor: colors.input, borderRadius: 20, padding: 15, gap: 8 }, selected: { backgroundColor: colors.yellow }, title: { fontSize: 13, fontWeight: '600', color: colors.navy }, copy: { fontSize: 10, lineHeight: 17, fontWeight: '500', color: colors.secondaryText },
});
