import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { Animated, Easing, Image, Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { ActionButton } from './ActionButton';
import { useProfile } from '../contexts/ProfileContext';
import { colors } from '../constants/colors';
import { useWallet } from '../contexts/WalletContext';
import { useNotifications } from '../contexts/NotificationContext';

const methods = [
  { id: 'momo', name: 'MTN MoMo', image: require('../../assets/momo.jpeg'), code: '*126#' },
  { id: 'om', name: 'Orange Money', image: require('../../assets/om.png'), code: '*150#' },
] as const;

export type WalletTopUpHandle = { requestClose: () => void };
export function WalletTopUp({ onBack, onClose, ref }: { onBack: () => void; onClose: () => void; ref?: Ref<WalletTopUpHandle> }) {
  const { profile } = useProfile();
  const [method, setMethod] = useState<'momo' | 'om'>('momo');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [processing, setProcessing] = useState(false);
  const [expired, setExpired] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; date: number } | null>(null);
  const [warning, setWarning] = useState<'details' | 'close' | null>(null);
  const pending = useRef<string | null>(null);
  const { simulateDeposit } = useWallet();
  const { notify } = useNotifications();
  useImperativeHandle(ref, () => ({ requestClose: () => processing ? setWarning('close') : onClose() }), [processing, onClose]);
  const rotation = useRef(new Animated.Value(0)).current;
  const selected = methods.find(item => item.id === method)!;
  const accountPhone = profile?.phone || (__DEV__ ? '612345678' : '');
  const paymentPhone = phone.trim() || accountPhone;
  const normalizedPhone = paymentPhone.replace(/[\s()+-]/g, '').replace(/^237/, '');
  const validPhone = /^6\d{8}$/.test(normalizedPhone);
  const validAmount = /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount)) && Number(amount) > 0;
  useEffect(() => {
    if (!processing || expired) return;
    rotation.setValue(0);
    const animation = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    const requestId = pending.current;
    const timeout = setTimeout(() => {
      if (!requestId || pending.current !== requestId) return;
      if (!__DEV__) { setExpired(true); return; }
      // Development-only completion. Production requires provider confirmation.
      if (simulateDeposit(requestId, Number(amount))) notify({ id: `deposit:${requestId}`, title: 'Money added to your wallet', body: `${Number(amount).toLocaleString('en-GB')} XAF has been deposited into your Zipp Wallet.`, kind: 'wallet' });
      pending.current = null;
      setWarning(null); setProcessing(false); setReceipt({ id: requestId, date: Date.now() });
    }, __DEV__ ? 5000 : 60000);
    return () => { animation.stop(); clearTimeout(timeout); };
  }, [processing, expired, rotation, amount, simulateDeposit, notify]);
  if (receipt) return <View style={styles.page}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.receiptBody}>
      <View style={styles.successIcon}><Ionicons name="checkmark" size={42} color={colors.primary} /></View>
      <Text accessibilityLiveRegion="polite" style={styles.processingTitle}>Payment successful</Text><Text style={styles.copy}>Your Zipp Wallet has been topped up.</Text>
      <View style={styles.receiptCard}><Text style={styles.label}>AMOUNT ADDED</Text><Text style={styles.processingAmount}>{Number(amount).toLocaleString('en-GB')} <Text style={styles.currency}>XAF</Text></Text>
        {([['Payment method', selected.name], ['Phone number', paymentPhone], ['Date', new Date(receipt.date).toLocaleString('en-GB')], ['Status', 'Completed'], ['Reference', receipt.id]] as const).map(([label, value]) => <View key={label} style={styles.receiptRow}><Text style={styles.copy}>{label}</Text><Text selectable style={styles.receiptValue}>{value}</Text></View>)}
      </View>
    </ScrollView><ActionButton accessibilityLabel="Back to wallet" onPress={onBack}>Back to wallet</ActionButton>
  </View>;
  if (processing) return <View style={styles.processing}>
    <View style={styles.processingBody}>
      {expired ? <View style={styles.timeoutIcon}><Ionicons name="time-outline" size={42} color={colors.primary} /></View> : <Animated.View accessibilityLabel="Processing payment" style={[styles.ring, { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} />}
      <Text accessibilityLiveRegion="polite" style={styles.processingTitle}>{expired ? 'Confirmation pending' : 'Processing payment'}</Text>
      <Text style={styles.processingAmount}>{Number(amount).toLocaleString('en-GB')} <Text style={styles.currency}>XAF</Text></Text>
      <View style={styles.instructions}><View style={styles.logoClip}><Image source={selected.image} resizeMode="cover" style={styles.logoImage} /></View><Text style={styles.instructionTitle}>Confirm with {selected.name}</Text><Text style={styles.instructionCopy}>Dial <Text style={styles.code}>{selected.code}</Text> on your phone and confirm payment.</Text><Text style={styles.phoneCopy}>{paymentPhone}</Text></View>
      <Text style={styles.hint}>{expired ? 'Payment confirmation has not been received. Check your mobile money account before trying again.' : 'Your wallet balance updates once payment is confirmed. Never share your mobile money PIN.'}</Text>
    </View>
    <Pressable accessibilityRole="button" onPress={() => setWarning('details')} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.navy} /><Text style={styles.backText}>Back to payment details</Text></Pressable>
    <Modal transparent visible={warning !== null} animationType="fade" onRequestClose={() => setWarning(null)}>
      <View style={styles.warningRoot}><Pressable accessibilityLabel="Keep waiting for payment" accessibilityRole="button" onPress={() => setWarning(null)} style={styles.warningBackdrop} /><View accessibilityViewIsModal style={styles.warningCard}>
        <View style={styles.warningIcon}><Ionicons name="alert-circle-outline" size={32} color={colors.navy} /></View><Text style={styles.heading}>Cancel this payment?</Text><Text style={styles.warningCopy}>Going back will cancel this payment request. Do not approve it on your phone after canceling. You can start a new request from payment details.</Text>
        <ActionButton accessibilityLabel="Keep waiting" onPress={() => setWarning(null)}>Keep waiting</ActionButton>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel payment" onPress={() => { const close = warning === 'close'; pending.current = null; setWarning(null); setProcessing(false); setExpired(false); if (close) onClose(); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel payment</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
  return <View style={styles.page}>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.navy} /><Text style={styles.backText}>Your wallet</Text></Pressable>
      <View style={styles.intro}><Text style={styles.heading}>Add money, keep moving</Text><Text style={styles.copy}>Choose how you want to top up your Zipp Wallet.</Text></View>
      <Text style={styles.label}>Payment method</Text>
      <View style={styles.methods}>{methods.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: method === item.id }} accessibilityLabel={item.name} onPress={() => setMethod(item.id)} style={[styles.method, method === item.id && styles.selected]}>
        <View style={styles.methodTop}><View style={styles.logoClip}><Image source={item.image} resizeMode="cover" style={styles.logoImage} /></View><Ionicons name={method === item.id ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={method === item.id ? colors.navy : '#A1A7AF'} /></View><Text style={styles.methodName}>{item.name}</Text>
      </Pressable>)}</View>
      <View style={styles.fieldGroup}><Text style={styles.label}>Amount</Text><View style={styles.inputRow}><TextInput accessibilityLabel="Top-up amount in XAF" value={amount} onChangeText={text => setAmount(text.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#949BA4" maxLength={9} style={[styles.input, styles.amountInput]} /><Text style={styles.currency}>XAF</Text></View></View>
      <View style={styles.fieldGroup}><Text style={styles.label}>Mobile money number</Text><View style={styles.inputRow}><Text style={styles.prefix}>+237</Text><TextInput accessibilityLabel="Mobile money phone number" value={phone} onChangeText={setPhone} placeholder={accountPhone || '6XX XXX XXX'} placeholderTextColor="#949BA4" keyboardType="phone-pad" autoComplete="tel" maxLength={18} style={styles.input} /></View><Text style={styles.hint}>{phone && !validPhone ? 'Enter a valid 9-digit Cameroon phone number.' : 'Use your account number or enter another number to pay with.'}</Text></View>
    </ScrollView>
    <View style={styles.footer}><ActionButton accessibilityLabel="Send payment request" disabled={!validAmount || !validPhone} onPress={() => { if (pending.current) return; Keyboard.dismiss(); pending.current = `topup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; setExpired(false); setReceipt(null); setProcessing(true); }}>Send payment request</ActionButton></View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, form: { gap: 13, paddingBottom: 18 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, alignSelf: 'flex-start' }, backText: { fontSize: 12, fontWeight: '600', color: colors.navy },
  intro: { gap: 5, paddingBottom: 5 }, heading: { fontSize: 20, fontWeight: '600', color: colors.navy }, copy: { fontSize: 12, lineHeight: 20, color: colors.secondaryText },
  label: { fontSize: 12, fontWeight: '600', color: colors.navy },
  methods: { flexDirection: 'row', gap: 12 }, method: { flex: 1, backgroundColor: colors.input, borderRadius: 17, padding: 14, gap: 14 }, selected: { backgroundColor: colors.yellow },
  logoClip: { width: 54, height: 60, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.white }, logoImage: { width: '100%', height: '100%' },
  receiptBody: { alignItems: 'center', paddingVertical: 22, gap: 14 }, successIcon: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  receiptCard: { alignSelf: 'stretch', padding: 20, backgroundColor: colors.input, borderRadius: 20, gap: 16 }, receiptRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 18 }, receiptValue: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '600', color: colors.navy },
  warningRoot: { flex: 1, justifyContent: 'center', padding: 24 }, warningBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,27,38,0.55)' }, warningCard: { backgroundColor: colors.white, borderRadius: 26, padding: 24, gap: 18 }, warningIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' }, warningCopy: { fontSize: 13, lineHeight: 22, color: colors.secondaryText }, cancelButton: { alignItems: 'center', padding: 12 }, cancelText: { fontSize: 14, fontWeight: '600', color: colors.error },
  methodTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, logo: { width: 54, height: 42, borderRadius: 8 }, methodName: { fontSize: 12, fontWeight: '600', color: colors.navy },
  fieldGroup: { gap: 8 }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 16, backgroundColor: colors.input, minHeight: 58 },
  input: { flex: 1, minWidth: 0, fontFamily: 'Poppins_500Medium', fontSize: 16, color: colors.navy, paddingVertical: 14 }, amountInput: { fontSize: 24, fontFamily: 'Poppins_600SemiBold' }, prefix: { fontSize: 14, fontWeight: '500', color: colors.secondaryText }, currency: { fontSize: 15, fontWeight: '600', color: colors.primary },
  hint: { fontSize: 11, lineHeight: 18, color: colors.secondaryText }, footer: { paddingTop: 12 },
  processing: { flex: 1 }, processingBody: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 17 }, ring: { width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: colors.primarySoft, borderTopColor: colors.primary, borderRightColor: colors.primary },
  timeoutIcon: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderRadius: 37 },
  processingTitle: { fontSize: 22, fontWeight: '600', color: colors.navy, textAlign: 'center' }, processingAmount: { fontSize: 26, fontWeight: '700', color: colors.navy },
  instructions: { alignSelf: 'stretch', alignItems: 'center', padding: 22, borderRadius: 20, backgroundColor: colors.input, gap: 10 }, smallLogo: { width: 50, height: 40, borderRadius: 8 }, instructionTitle: { fontSize: 14, fontWeight: '600', color: colors.navy }, instructionCopy: { fontSize: 14, lineHeight: 24, color: colors.secondaryText, textAlign: 'center' }, code: { fontWeight: '700', color: colors.primary }, phoneCopy: { fontSize: 13, fontWeight: '500', color: colors.navy },
});

