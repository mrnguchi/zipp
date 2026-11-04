import {KeyboardAwareScrollView as ScrollView} from './KeyboardAwareScrollView';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from './LocalizedNative';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import {Animated, Easing, Image, Keyboard, Modal, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { FormField } from './FormField';
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
  const [phone, setPhone] = useState(profile?.phone?.replace(/[\s()+-]/g, '').replace(/^237/, '') || '');
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
      if (simulateDeposit(requestId, Number(amount))) notify({ id: `deposit:${requestId}`, title: 'Money added to your wallet', body: `${Number(amount).toLocaleString('en-GB')} XAF has been deposited into your Zipp Wallet.`, kind: 'wallet', soundEvent: 'wallet_deposit' });
      pending.current = null;
      setWarning(null); setProcessing(false); setReceipt({ id: requestId, date: Date.now() });
    }, __DEV__ ? 5000 : 60000);
    return () => { animation.stop(); clearTimeout(timeout); };
  }, [processing, expired, rotation, amount, simulateDeposit, notify]);
  if (receipt) return <View style={styles.page}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.receiptBody}>
      <View style={styles.successIcon}><Ionicons name="checkmark" size={42} color={colors.primary} /></View>
      <Text translate accessibilityLiveRegion="polite" style={styles.processingTitle}>Payment successful</Text><Text translate style={styles.copy}>Your Zipp Wallet has been topped up.</Text>
      <View style={styles.receiptCard}><Text translate style={styles.label}>AMOUNT ADDED</Text><Text translate style={[styles.processingAmount,{color:colors.primary}]}>+{Number(amount).toLocaleString('en-GB')} <Text translate style={styles.currency}>XAF</Text></Text>
        {([['Payment method', selected.name], ['Phone number', paymentPhone], ['Date', new Date(receipt.date).toLocaleString('en-GB', {timeZone:'Africa/Douala'})], ['Status', 'Completed'], ['Reference', receipt.id]] as const).map(([label, value]) => <View key={label} style={styles.receiptRow}><Text translate style={styles.copy}>{label}</Text><Text translate selectable style={styles.receiptValue}>{value}</Text></View>)}
      </View>
    </ScrollView><ActionButton accessibilityLabel="Back to wallet" onPress={onBack}>Back to wallet</ActionButton>
  </View>;
  if (processing) return <View style={styles.processing}>
    <ScrollView style={{flex:1}} contentContainerStyle={styles.processingBody} showsVerticalScrollIndicator={false}>
      {expired ? <View style={styles.timeoutIcon}><Ionicons name="time-outline" size={42} color={colors.primary} /></View> : <Animated.View accessibilityLabel="Processing payment" style={[styles.ring, { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} />}
      <Text translate accessibilityLiveRegion="polite" style={styles.processingTitle}>{expired ? 'Confirmation pending' : 'Processing payment'}</Text>
      <Text translate style={styles.processingAmount}>{Number(amount).toLocaleString('en-GB')} <Text translate style={styles.currency}>XAF</Text></Text>
      <View style={styles.instructions}><View style={styles.logoClip}><Image source={selected.image} resizeMode="cover" style={styles.logoImage} /></View><Text translate style={styles.instructionTitle}>Confirm with {selected.name}</Text><Text translate style={styles.instructionCopy}>Dial <Text translate style={styles.code}>{selected.code}</Text> on your phone and confirm payment.</Text><Text translate style={styles.phoneCopy}>{paymentPhone}</Text></View>
      <Text translate style={styles.hint}>{expired ? 'Payment confirmation has not been received. Check your mobile money account before trying again.' : 'Your wallet balance updates once payment is confirmed. Never share your mobile money PIN.'}</Text>
    </ScrollView>
    <Pressable accessibilityRole="button" onPress={() => setWarning('details')} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.navy} /><Text translate style={styles.backText}>Back to payment details</Text></Pressable>
    <Modal transparent visible={warning !== null} animationType="fade" onRequestClose={() => setWarning(null)}>
      <View style={styles.warningRoot}><Pressable accessibilityLabel="Keep waiting for payment" accessibilityRole="button" onPress={() => setWarning(null)} style={styles.warningBackdrop} /><View accessibilityViewIsModal style={styles.warningCard}>
        <View style={styles.warningIcon}><Ionicons name="alert-circle-outline" size={32} color={colors.navy} /></View><Text translate style={styles.heading}>Cancel this payment?</Text><Text translate style={styles.warningCopy}>Going back will cancel this payment request. Do not approve it on your phone after canceling. You can start a new request from payment details.</Text>
        <ActionButton accessibilityLabel="Keep waiting" onPress={() => setWarning(null)}>Keep waiting</ActionButton>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel payment" onPress={() => { const close = warning === 'close'; pending.current = null; setWarning(null); setProcessing(false); setExpired(false); if (close) onClose(); }} style={styles.cancelButton}><Text translate style={styles.cancelText}>Cancel payment</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
  return <View style={styles.page}>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.navy} /><Text translate style={styles.backText}>Your wallet</Text></Pressable>
      <View style={styles.intro}><Text translate style={styles.introHeading}>Choose how you want to top up your Zipp Wallet.</Text></View>
      <Text translate style={styles.label}>Payment method</Text>
      <View style={styles.methods}>{methods.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: method === item.id }} accessibilityLabel={item.name} onPress={() => setMethod(item.id)} style={[styles.method, method === item.id && styles.selected]}>
        <View style={styles.methodTop}><View style={styles.logoClip}><Image source={item.image} resizeMode="cover" style={styles.logoImage} /></View><Ionicons name={method === item.id ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={method === item.id ? colors.navy : '#A1A7AF'} /></View><Text  style={styles.methodName}>{item.name}</Text>
      </Pressable>)}</View>
      <FormField label="Amount (XAF)" accessibilityLabel="Top-up amount in XAF" value={amount} onChangeText={text=>setAmount(text.replace(/[^0-9]/g,''))} keyboardType="number-pad" placeholder="0" maxLength={9} style={styles.amountInput} validate={text=>!/^\d+$/.test(text)||Number(text)<=0?'Enter an amount greater than 0 XAF.':undefined}/>
      <View style={styles.quickAmounts}>{[2000,5000,10000].map(value=><Pressable key={value} accessibilityRole="button" accessibilityLabel={`Top up ${value} XAF`} accessibilityState={{selected:amount===String(value)}} onPress={()=>setAmount(String(value))} style={[styles.quickAmount,amount===String(value)&&styles.quickSelected]}><Text translate style={[styles.quickAmountText,amount===String(value)&&{color:colors.navy}]}>{value.toLocaleString('en-GB')}</Text></Pressable>)}</View>
      <FormField label="Mobile money number (+237)" accessibilityLabel="Mobile money phone number" value={phone} onChangeText={setPhone} placeholder={accountPhone||'6XX XXX XXX'} keyboardType="phone-pad" autoComplete="tel" maxLength={18} hint="Use your account number or enter the number you want to pay with." validate={text=>!/^6\d{8}$/.test((text.trim()||accountPhone).replace(/[\s()+-]/g,'').replace(/^237/,''))?'Enter a valid 9-digit Cameroon phone number.':undefined}/>

    </ScrollView>
    <View style={styles.footer}><ActionButton accessibilityLabel="Send payment request" disabled={!validAmount || !validPhone} onPress={() => { if (pending.current) return; Keyboard.dismiss(); pending.current = `topup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; setExpired(false); setReceipt(null); setProcessing(true); }}>Send payment request</ActionButton></View>
  </View>;
}

const styles = StyleSheet.create({
  quickAmounts: {flexDirection:'row',gap:10},quickAmount:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',backgroundColor:colors.iconBackground,borderRadius:22,borderWidth:1,borderColor:colors.border},quickSelected:{backgroundColor:colors.yellow,borderColor:colors.yellow},quickAmountText:{fontSize:14,lineHeight:22,fontWeight:'600',color:colors.navy},
  page: { flex: 1 }, form: { gap: 13, paddingBottom: 18 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, alignSelf: 'flex-start' }, backText: { lineHeight: 23, fontSize: 15, fontWeight: '600', color: colors.navy },
  intro: { gap: 5, paddingBottom: 5 }, introHeading: { fontSize: 17, lineHeight: 26, fontWeight: '500', color: colors.navy }, heading: { lineHeight: 30, fontSize: 22, fontWeight: '600', color: colors.navy }, copy: { lineHeight: 24, fontSize: 15, color: colors.secondaryText },
  label: { lineHeight: 23, fontSize: 15, fontWeight: '600', color: colors.navy },
  methods: { flexDirection: 'row', gap: 12 }, method: { flex: 1, backgroundColor: colors.input, borderRadius: 17, padding: 14, gap: 14 }, selected: { backgroundColor: colors.yellow },
  logoClip: { width: 54, height: 60, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.white }, logoImage: { width: '100%', height: '100%' },
  receiptBody: { alignItems: 'center', paddingVertical: 22, gap: 14 }, successIcon: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.iconBackground, alignItems: 'center', justifyContent: 'center' },
  receiptCard: { alignSelf: 'stretch', padding: 20, backgroundColor: colors.input, borderRadius: 20, gap: 16 }, receiptRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 18 }, receiptValue: { lineHeight: 23, flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '600', color: colors.navy },
  warningRoot: { flex: 1, justifyContent: 'center', padding: 24 }, warningBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,27,38,0.55)' }, warningCard: { backgroundColor: colors.white, borderRadius: 26, padding: 24, gap: 18 }, warningIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.iconBackground, alignItems: 'center', justifyContent: 'center' }, warningCopy: { lineHeight: 24, fontSize: 15, color: colors.secondaryText }, cancelButton: { alignItems: 'center', padding: 12 }, cancelText: { lineHeight: 24, fontSize: 16, fontWeight: '600', color: colors.error },
  methodTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, logo: { width: 54, height: 42, borderRadius: 8 }, methodName: { lineHeight: 24, fontSize: 16, fontWeight: '600', color: colors.navy },
  fieldGroup: { gap: 8 }, inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 16, backgroundColor: colors.input, minHeight: 58 },
  input: { flex: 1, minWidth: 0, fontFamily: 'Poppins_500Medium', fontSize: 16, color: colors.navy, paddingVertical: 14 }, amountInput: { fontSize: 24, fontFamily: 'Poppins_600SemiBold' }, prefix: { lineHeight: 24, fontSize: 16, fontWeight: '500', color: colors.secondaryText }, currency: { fontSize: 15, fontWeight: '600', color: colors.primary },
  hint: { lineHeight: 21, fontSize: 13, color: colors.secondaryText }, footer: { paddingTop: 12 },
  processing: { flex: 1 }, processingBody: { flexGrow: 1, paddingVertical: 20, justifyContent: 'center', alignItems: 'center', gap: 17 }, ring: { width: 74, height: 74, borderRadius: 37, borderWidth: 5, borderColor: colors.primarySoft, borderTopColor: colors.primary, borderRightColor: colors.primary },
  timeoutIcon: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconBackground, borderRadius: 37 },
  processingTitle: { lineHeight: 33, fontSize: 24, fontWeight: '600', color: colors.navy, textAlign: 'center' }, processingAmount: { lineHeight: 40, fontSize: 30, fontWeight: '700', color: colors.navy },
  instructions: { alignSelf: 'stretch', alignItems: 'center', padding: 22, borderRadius: 20, backgroundColor: colors.input, gap: 10 }, smallLogo: { width: 50, height: 40, borderRadius: 8 }, instructionTitle: { lineHeight: 26, fontSize: 18, fontWeight: '600', color: colors.navy }, instructionCopy: { lineHeight: 26, fontSize: 16, color: colors.secondaryText, textAlign: 'center' }, code: { fontWeight: '700', color: colors.primary }, phoneCopy: { lineHeight: 24, fontSize: 16, fontWeight: '500', color: colors.navy },
});

