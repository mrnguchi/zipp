import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import { useWallet } from '../contexts/WalletContext';
import type { WalletTransaction } from '../contexts/WalletContext';
import { profileDisplayName, useProfile } from '../contexts/ProfileContext';
import { useActivity } from '../contexts/ActivityContext';

const canvas = require('../../assets/wallet canvas.png');
const asset = Image.resolveAssetSource(canvas);
const canvasRatio = (asset?.width || 1536) / (asset?.height || 1024);
const money = (value: number) => value.toLocaleString('en-GB');

export function WalletSheetContent({ onTopUp }: { onTopUp: () => void }) {
  const wallet = useWallet();
  const { profile } = useProfile();
  const { records } = useActivity();
  const [hidden, setHidden] = useState(false);
  // Display-only fixtures for development; these never change the wallet ledger.
  const [previewTransactions] = useState<(WalletTransaction & { title?: string })[]>(() => __DEV__ ? [
    { id: 'wallet-preview-topup', kind: 'deposit', amount: 10000, date: Date.now() - 1800000, title: 'Wallet top-up' },
    { id: 'wallet-preview-ride', kind: 'payment', amount: 1500, date: Date.now() - 7200000, title: 'Everyday ride' },
    { id: 'wallet-preview-delivery', kind: 'payment', amount: 2250, date: Date.now() - 86400000, title: 'Express delivery' },
    { id: 'wallet-preview-fee', kind: 'payment', amount: 500, date: Date.now() - 172800000, title: 'Cancellation fee' },
  ] : []);
  const transactions: (WalletTransaction & { title?: string })[] = [...wallet.transactions, ...previewTransactions];
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <View style={styles.canvas}>
      <Image source={canvas} resizeMode="contain" style={[styles.canvasImage, { aspectRatio: canvasRatio }]} />
      <Text numberOfLines={1} style={styles.name}>{profileDisplayName(profile) || 'Nguchi'}</Text>
      <View style={styles.details}>
        <Text style={styles.label}>Available balance</Text>
        <View style={styles.amountRow}><Text numberOfLines={1} adjustsFontSizeToFit style={styles.amount}>{hidden ? '••••' : money(wallet.available)}</Text><Text style={styles.currency}>XAF</Text></View>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" onPress={onTopUp} style={({ pressed }) => [styles.add, pressed && styles.pressed]}><Text style={styles.plus}>+</Text><Text style={styles.addText}>Add Balance</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show wallet balance' : 'Hide wallet balance'} onPress={() => setHidden(value => !value)} style={styles.eye}><Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.white} /></Pressable>
        </View>
      </View>
    </View>
    {wallet.balance > wallet.available && <View style={styles.reserved}><Ionicons name="lock-closed-outline" size={15} color={colors.primary} /><Text style={styles.secondary}>{money(wallet.balance - wallet.available)} XAF reserved for active bookings</Text></View>}
    <View style={styles.sectionHeading}><Text style={styles.heading}>Transactions</Text><Text style={styles.secondary}>Recent activity</Text></View>
    {transactions.length === 0 ? <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={24} color={colors.primary} /></View><Text style={styles.emptyTitle}>Your transactions, all here</Text><Text style={styles.emptyCopy}>Top-ups and payments will appear here as you use your wallet.</Text></View> : <View style={styles.rows}>
      {transactions.map(transaction => {
        const booking = records.find(record => record.id === transaction.id);
        const incoming = transaction.kind === 'deposit';
        const title = transaction.title || (incoming ? 'Wallet top-up' : booking?.status === 'canceled' ? 'Cancellation fee' : booking?.title || 'Wallet payment');
        return <View key={`${transaction.kind}-${transaction.id}`} style={styles.transaction}>
          <View style={[styles.transactionIcon, incoming && { backgroundColor: colors.primarySoft }]}><Ionicons name={incoming ? 'arrow-down' : 'arrow-up'} size={20} color={colors.primary} /></View>
          <View style={styles.transactionInfo}><Text numberOfLines={1} style={styles.transactionTitle}>{title}</Text><Text style={styles.date}>{new Date(transaction.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text></View>
          <View style={styles.transactionAmount}><Text style={[styles.value, incoming && { color: colors.primary }]}>{incoming ? '+' : '−'}{money(transaction.amount)}</Text><Text style={styles.date}>XAF · {incoming ? 'Received' : 'Paid'}</Text></View>
        </View>;
      })}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 20, gap: 18 },
  canvas: { width: '100%', position: 'relative', flexShrink: 0, overflow: 'hidden' },
  canvasImage: { width: '100%', height: undefined },
  name: { position: 'absolute', top: '20%', left: '9%', width: '43%', fontSize: 12, fontWeight: '600', color: colors.navy },
  details: { position: 'absolute', top: '42%', bottom: '13%', left: '9%', right: '9%', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: '500', color: '#CFD5DE' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  amount: { fontSize: 29, fontWeight: '700', color: colors.white, flexShrink: 1 },
  currency: { fontSize: 14, fontWeight: '700', color: colors.yellow },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#72808F', backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 13, minHeight: 36, borderRadius: 20 },
  plus: { fontSize: 20, fontWeight: '600', color: colors.white },
  addText: { fontSize: 12, fontWeight: '600', color: colors.white },
  eye: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  reserved: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.input, borderRadius: 12 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { fontSize: 18, fontWeight: '600', color: colors.navy },
  secondary: { fontSize: 11, color: colors.secondaryText, flexShrink: 1 },
  rows: { gap: 10 },
  transaction: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.input, padding: 14, minHeight: 80, borderRadius: 15 },
  transactionIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  transactionInfo: { flex: 1, gap: 4 },
  transactionTitle: { fontSize: 12, fontWeight: '600', color: colors.navy },
  date: { fontSize: 10, color: colors.secondaryText },
  transactionAmount: { alignItems: 'flex-end', gap: 4 },
  value: { fontSize: 14, fontWeight: '600', color: colors.navy },
  empty: { padding: 24, alignItems: 'center', gap: 10, backgroundColor: colors.input, borderRadius: 16 },
  emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: colors.navy },
  emptyCopy: { fontSize: 12, lineHeight: 20, color: colors.secondaryText, textAlign: 'center' },
});
