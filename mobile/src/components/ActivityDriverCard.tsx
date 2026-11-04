import {LocalizedPressable as Pressable} from './LocalizedNative';
import { useState } from 'react';
import {Linking, Modal, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { ActionButton } from './ActionButton';
import { colors } from '../constants/colors';
import type { ActivityRecord } from '../services/activityHistory';

export function ActivityDriverCard({ item }: { item: ActivityRecord }) {
  const [contact, setContact] = useState<'message' | 'call' | null>(null);
  const [failed, setFailed] = useState(false);
  const role = item.kind === 'ride' ? 'driver' : 'courier';
  const rating = item.driverRating ?? (__DEV__ ? 4.9 : undefined);
  const trips = item.driverTrips ?? (__DEV__ ? 320 : undefined);
  async function openContact(action: 'message' | 'call') {
    const phone = item.driverPhone?.replace(/[^+\d]/g, '');
    if (!phone || !/^\+?\d{8,15}$/.test(phone)) { setFailed(false); setContact(action); return; }
    try { await Linking.openURL(`${action === 'call' ? 'tel' : 'sms'}:${phone}`); }
    catch { setFailed(true); setContact(action); }
  }
  return <View style={styles.card}>
    <Text translate style={styles.heading}>{item.kind === 'ride' ? 'Driver' : 'Courier & package'}</Text>
    <View style={styles.profile}>
      <View style={styles.avatar}><Ionicons name="person" size={26} color={colors.primary} /></View>
      <View style={styles.info}><Text translate style={styles.name}>{item.driver}</Text><View style={styles.rating}><Ionicons name="star" size={14} color={colors.yellow} /><Text translate style={styles.caption}>{rating !== undefined ? rating.toFixed(1) : 'New'}{trips !== undefined ? ` · ${trips.toLocaleString('en-GB')} trips` : ''}</Text></View></View>
      <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={`Message ${role}`} onPress={() => { void openContact('message'); }} style={styles.contact}><Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.navy} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Call ${role}`} onPress={() => { void openContact('call'); }} style={styles.contact}><Ionicons name="call-outline" size={21} color={colors.navy} /></Pressable></View>
    </View>
    {item.detail && <><View style={styles.divider} /><Text translate style={styles.caption}>{item.detail}</Text></>}
    {item.kind === 'delivery' && <Text translate style={styles.caption}>{item.perspective === 'receiving' ? 'Receiving a package' : 'Sending a package'}{item.recipient ? ` · ${item.recipient}` : ''}</Text>}
    {item.rating !== undefined && <View style={styles.rating}><Text translate style={styles.caption}>Your rating</Text>{[1, 2, 3, 4, 5].map(value => <Ionicons key={value} name={value <= item.rating! ? 'star' : 'star-outline'} size={15} color={colors.yellow} />)}</View>}
    <Modal transparent visible={contact !== null} animationType="fade" onRequestClose={() => setContact(null)}><View style={styles.modal}><Pressable accessibilityRole="button" accessibilityLabel="Close contact information" onPress={() => setContact(null)} style={styles.backdrop} /><View accessibilityViewIsModal style={styles.dialog}><View style={styles.avatar}><Ionicons name={contact === 'call' ? 'call-outline' : 'chatbubble-ellipses-outline'} size={26} color={colors.primary} /></View><Text translate style={styles.name}>{contact === 'call' ? 'Call' : 'Message'} {item.driver}</Text><Text translate style={styles.copy}>{failed ? `Could not open your ${contact === 'call' ? 'phone' : 'messaging'} app. Please try again on your phone.` : `Contact details are unavailable for this trip.`}</Text><ActionButton accessibilityLabel="Close contact information" onPress={() => setContact(null)}>Done</ActionButton></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.input, padding: 16, borderRadius: 18, gap: 14 }, heading: { lineHeight: 25, fontSize: 17, fontWeight: '600', color: colors.navy }, profile: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.iconBackground, alignItems: 'center', justifyContent: 'center' }, info: { flex: 1, minWidth: 105, gap: 4 }, name: { lineHeight: 26, fontSize: 18, fontWeight: '600', color: colors.navy }, rating: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 }, caption: { lineHeight: 22, fontSize: 14, fontWeight: '500', color: colors.secondaryText }, actions: { flexDirection: 'row', gap: 8 }, contact: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, modal: { flex: 1, padding: 24, justifyContent: 'center' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,27,38,0.45)' }, dialog: { backgroundColor: colors.white, borderRadius: 24, padding: 24, gap: 18 }, copy: { lineHeight: 24, fontSize: 15, color: colors.secondaryText },
});
