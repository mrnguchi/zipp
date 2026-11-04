import { inputStyles } from '../constants/inputStyles';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from './LocalizedNative';
import {StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormField } from './FormField';
import { validDeliveryPhone } from '../services/deliveryFlow';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import { PackagePhotoInput } from './PackagePhotoInput';
import type { DeliveryDraft } from '../services/deliveryFlow';
type Props = { draft: DeliveryDraft; onChange: (update: Partial<DeliveryDraft>) => void };
export function DeliveryDetailsForm({ draft, onChange }: Props) {
  return <View style={styles.content}>
    <View><Text translate style={styles.heading}>Your details</Text><Text translate style={styles.roleHint}>{draft.perspective === 'receiving' ? 'You’ll receive the package at drop-off.' : 'You’ll hand the package to the courier at pickup.'}</Text><View style={styles.card}><Field label="Your name" value={draft.perspective === 'receiving' ? draft.recipientName : draft.senderName} onChange={name => onChange(draft.perspective === 'receiving' ? { recipientName: name } : { senderName: name })} /><Field label="Your phone" phone value={draft.perspective === 'receiving' ? draft.recipientPhone : draft.senderPhone} onChange={phone => onChange(draft.perspective === 'receiving' ? { recipientPhone: phone } : { senderPhone: phone })} /></View></View>
    <View><Text translate style={styles.heading}>{draft.perspective === 'receiving' ? 'Who’s sending it?' : 'Who’s receiving it?'}</Text><View style={styles.card}><Field label={draft.perspective === 'receiving' ? 'Sender name' : 'Recipient name'} value={draft.perspective === 'receiving' ? draft.senderName : draft.recipientName} onChange={name => onChange(draft.perspective === 'receiving' ? { senderName: name } : { recipientName: name })} /><Field label={draft.perspective === 'receiving' ? 'Sender phone' : 'Recipient phone'} phone value={draft.perspective === 'receiving' ? draft.senderPhone : draft.recipientPhone} onChange={phone => onChange(draft.perspective === 'receiving' ? { senderPhone: phone } : { recipientPhone: phone })} /></View></View>
    <View><Text translate style={styles.heading}>{draft.perspective === 'receiving' ? 'What are you receiving?' : 'What are you sending?'}</Text><View style={styles.card}><Field label="Item description" value={draft.description} onChange={description => onChange({ description })} placeholder="e.g. Documents, a pair of shoes" /><Text translate style={styles.label}>Package size</Text><View style={styles.sizes}>{(['small', 'medium', 'large'] as const).map(size => <Pressable key={size} accessibilityRole="radio" accessibilityState={{ checked: draft.size === size }} onPress={() => onChange({ size })} style={[styles.size, draft.size === size && styles.selected]}><Ionicons name="cube-outline" size={22} color={colors.navy} /><Text translate style={styles.sizeText}>{size[0].toUpperCase() + size.slice(1)}</Text></Pressable>)}</View><PackagePhotoInput photo={draft.photo} onChange={photo => onChange({ photo })} /></View></View>
  </View>;
}
function Field({ label, value, onChange, phone = false, placeholder, multiline = false }: { label: string; value: string; onChange: (value: string) => void; phone?: boolean; placeholder?: string; multiline?: boolean }) {
  return <FormField label={label} value={value} onChangeText={onChange} placeholder={placeholder ?? (phone ? '+237 6XX XXX XXX' : label)} keyboardType={phone ? 'phone-pad' : 'default'} autoComplete={phone ? 'tel' : label === 'Your name' ? 'name' : 'off'} autoCapitalize={phone ? 'none' : 'words'} multiline={multiline} maxLength={multiline ? 500 : 160} validate={text=>!text.trim()?'This field is required.':phone&&!validDeliveryPhone(text)?'Enter a valid phone number.':undefined}/>;
}
const styles = StyleSheet.create({
  roleHint: { fontSize: 11, lineHeight: 18, fontWeight: '500', color: colors.secondaryText, marginTop: -5, marginBottom: 12 },
  content: { gap: 22 }, heading: { fontSize: 16, fontWeight: '600', color: colors.navy, marginBottom: 12 }, card: { backgroundColor: colors.input, borderRadius: 22, padding: 16, gap: 16 }, field: { gap: 7 }, label: { fontSize: 11, fontWeight: '500', color: colors.secondaryText }, input: { ...inputStyles.field }, multiline: { minHeight: 82, textAlignVertical: 'top' }, sizes: { flexDirection: 'row', gap: 8 }, size: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.white, borderRadius: 15 }, selected: { backgroundColor: colors.yellow }, sizeText: { fontSize: 11, fontWeight: '500', color: colors.navy },
});
