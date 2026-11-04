import { AppText as Text } from '../../components/AppText';
import {StyleSheet, Switch, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBiometricLock } from '../../contexts/BiometricContext';
import { ProfileFrame } from './ProfileDetailScreen';
import { colors } from '../../constants/colors';
import { ActionButton } from '../../components/ActionButton';

export function BiometricScreen() {
  const biometric = useBiometricLock();
  return <ProfileFrame title="Fingerprint / Face Unlock">
    <View style={s.hero}><View style={s.biometricIcon}><Ionicons name="finger-print-outline" size={48} color={colors.primary} /></View><Text translate style={s.title}>A quicker way to unlock Zipp</Text><Text translate style={s.body}>Use your phone’s fingerprint or face recognition when returning to the app.</Text></View>
    <View style={s.card}><View style={s.row}><View style={{ flex: 1 }}><Text translate style={s.label}>{biometric.label}</Text><Text translate style={s.body}>{biometric.enabled ? 'On · unlock required when you return' : 'Off'}</Text></View><Switch accessibilityLabel={biometric.label} disabled={biometric.busy || biometric.checking || (!biometric.available && !biometric.enabled)} value={biometric.enabled} onValueChange={value => { void biometric.setEnabled(value); }} trackColor={{ false: '#DDDFDA', true: colors.primary }} /></View>
    {!!biometric.reason && <Text translate style={s.body}>{biometric.reason}</Text>}
    {!biometric.available && <ActionButton accessibilityLabel="Check biometric support" disabled={biometric.checking} onPress={() => { void biometric.refresh(); }}>{biometric.checking ? 'Checking device…' : 'Check again'}</ActionButton>}
    {!!biometric.error && <Text translate accessibilityRole="alert" style={s.error}>{biometric.error}</Text>}
    {biometric.enabled && <ActionButton accessibilityLabel="Test biometric unlock" disabled={biometric.busy} onPress={() => { void biometric.test(); }}>{biometric.busy ? 'Verifying…' : 'Test unlock'}</ActionButton>}</View>
    <Text translate style={s.body}>Your biometric data stays on your phone. This setting applies to the current app session.</Text>
    <View style={s.card}><Text translate style={s.label}>About passkeys</Text><Text translate style={s.body}>Passkeys can also use your fingerprint or face to sign in to an account. Zipp account passkey sign-in is not available yet. Device unlock protects this app session.</Text></View>
  </ProfileFrame>;
}
const s=StyleSheet.create({ biometricIcon:{width:84,height:84,borderRadius:42,backgroundColor:colors.yellow+'24',alignItems:'center',justifyContent:'center'}, hero:{alignItems:'center',gap:18,paddingVertical:20},title:{fontSize:23,lineHeight:31,fontWeight:'600',color:'#292D2C',textAlign:'center'},body:{fontSize:14,lineHeight:23,color:'#777D76'},card:{backgroundColor:'#FFFFFF',padding:18,borderRadius:12,gap:16},row:{flexDirection:'row',alignItems:'center',gap:16},label:{fontSize:16,fontWeight:'600',lineHeight:24,color:'#292D2C'},error:{fontSize:14,lineHeight:22,color:'#B42318'} });
