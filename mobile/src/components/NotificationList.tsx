import {ScrollView, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import { useNotifications } from '../contexts/NotificationContext';
export function NotificationList() {
  const { notices } = useNotifications();
  return <ScrollView style={styles.list} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    {notices.length ? notices.map(notice => <View key={notice.id} style={styles.card}><View style={styles.icon}><Ionicons name={notice.kind === 'wallet' ? 'wallet-outline' : 'notifications-outline'} size={21} color={colors.primary} /></View><View style={styles.copy}><Text translate style={styles.title}>{notice.title}</Text><Text translate style={styles.body}>{notice.body}</Text><Text translate style={styles.time}>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Douala', hour: '2-digit', minute: '2-digit' }).format(new Date(notice.time))}</Text></View></View>) : <View style={styles.empty}><Ionicons name="notifications-outline" size={30} color={colors.primary} /><Text translate style={styles.title}>You’re all caught up</Text><Text translate style={styles.body}>Your ride and wallet updates appear here.</Text></View>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  list: { maxHeight: 440, flexShrink: 1 }, content: { gap: 12, paddingBottom: 12 }, card: { flexDirection: 'row', gap: 12, backgroundColor: colors.input, padding: 14, borderRadius: 18 }, icon: { width: 38, height: 38, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 4 }, title: { fontSize: 12, fontWeight: '600', color: colors.navy }, body: { fontSize: 11, lineHeight: 18, fontWeight: '500', color: colors.secondaryText }, time: { fontSize: 10, fontWeight: '500', color: colors.secondaryText }, empty: { alignItems: 'center', gap: 10, paddingVertical: 30 },
});
