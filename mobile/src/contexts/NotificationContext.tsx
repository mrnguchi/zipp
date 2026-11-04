import {LocalizedPressable as Pressable} from '../components/LocalizedNative';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {AccessibilityInfo, Animated, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { colors } from '../constants/colors';
import { subscribeWalletDeposits } from '../services/walletEvents';
import { formatXaf } from '../utils/formatCurrency';
import { useProfileSettings } from './ProfileSettingsContext';
import { useNotificationAudio } from './NotificationAudioContext';
import { resolveNotificationSound } from '../services/notificationSounds';
import type { NotificationEventKey } from '../services/notificationSounds';

export type AppNotice = { id: string; title: string; body: string; kind: 'ride' | 'wallet' | 'info'; soundEvent?: NotificationEventKey; time: number };
type NoticeInput = Omit<AppNotice, 'time'>;
const Context = createContext<{ notices: AppNotice[]; notify: (notice: NoticeInput) => void } | null>(null);
export function NotificationProvider({ children }: PropsWithChildren) {
  const { notifications, sounds } = useProfileSettings();
  const playSound = useNotificationAudio();
  const selectedSounds = useRef(sounds);
  selectedSounds.current = sounds;
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [queue, setQueue] = useState<AppNotice[]>([]);
  const seen = useRef(new Set<string>());
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const current = queue[0];
  const notify = useCallback((input: NoticeInput) => {
    if (seen.current.has(input.id)) return;
    seen.current.add(input.id);
    const notice = { ...input, time: Date.now() };
    setNotices(items => [notice, ...items].slice(0, 50));
    if (notifications[input.kind]) setQueue(items => [...items, notice]);
  }, [notifications]);
  useEffect(() => subscribeWalletDeposits(event => notify({ id: `deposit:${event.transactionId}`, title: 'Money added to your wallet', body: `${formatXaf(event.amount)} has been deposited into your Zipp Wallet.`, kind: 'wallet', soundEvent: 'wallet_deposit' })), [notify]);
  useEffect(() => {
    if (!current) return;
    void playSound(resolveNotificationSound(selectedSounds.current, current.soundEvent, current.kind)).catch(() => { /* Banners remain available if audio is interrupted. */ });
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility(`${current.title}. ${current.body}`);
    const timeout = setTimeout(() => setQueue(items => items.slice(1)), 6500);
    return () => { clearTimeout(timeout); opacity.stopAnimation(); };
  }, [current?.id, opacity, playSound]);
  return <Context.Provider value={{ notices, notify }}>{children}
    {current && <Animated.View style={[styles.banner, { top: insets.top + 10, opacity }]} accessibilityLiveRegion="polite">
      <View style={styles.icon}><Ionicons name={current.kind === 'wallet' ? 'wallet-outline' : 'notifications-outline'} size={23} color={colors.primary} /></View>
      <View style={styles.copy}><Text translate style={styles.title}>{current.title}</Text><Text translate style={styles.body}>{current.body}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setQueue(items => items.slice(1))} style={styles.close}><Ionicons name="close" size={21} color={colors.navy} /></Pressable>
    </Animated.View>}
  </Context.Provider>;
}
export function useNotifications() { const value = useContext(Context); if (!value) throw new Error('NotificationProvider is required'); return value; }
const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 16, right: 16, zIndex: 1000, elevation: 20, backgroundColor: colors.white, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: colors.navy, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 5 }, borderWidth: 1, borderColor: colors.border },
  icon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 }, title: { fontSize: 13, fontWeight: '600', color: colors.navy }, body: { fontSize: 11, lineHeight: 18, fontWeight: '500', color: colors.secondaryText },
  close: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
});
