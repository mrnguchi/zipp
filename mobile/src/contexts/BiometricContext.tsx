import {AppText as Text} from '../components/AppText';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {AppState, Modal, Platform, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { ActionButton } from '../components/ActionButton';

type BiometricState = { available: boolean; reason: string; label: string; checking: boolean };
type Value = BiometricState & { enabled: boolean; busy: boolean; error: string; refresh: () => Promise<void>; setEnabled: (enabled: boolean) => Promise<void>; test: () => Promise<void> };
const Context = createContext<Value | null>(null);
export function BiometricProvider({ children }: PropsWithChildren) {
  const [capability, setCapability] = useState<BiometricState>({ available: false, reason: '', label: 'Fingerprint / Face unlock', checking: true });
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const authenticating = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const [hardware, enrolled, types, level] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), LocalAuthentication.supportedAuthenticationTypesAsync(), LocalAuthentication.getEnrolledLevelAsync()]);
      const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const fingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
      const faceInExpoGo = Platform.OS === 'ios' && face && Constants.executionEnvironment === 'storeClient';
      const strong = Platform.OS !== 'android' || level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
      const reason = !hardware ? 'This device does not support biometric unlock.' : faceInExpoGo ? 'Face ID requires a Zipp development build. It is not available in Expo Go.' : !enrolled ? 'Set up fingerprint or face recognition in your phone settings, then check again.' : !strong ? 'Set up a strong biometric, such as fingerprint or 3D face recognition, on your phone.' : '';
      setCapability({ available: hardware && enrolled && strong && !faceInExpoGo, reason, label: face && fingerprint ? 'Fingerprint / Face unlock' : face ? 'Face unlock' : fingerprint ? 'Fingerprint unlock' : 'Biometric unlock', checking: false });
    } catch { setCapability({ available: false, reason: 'Biometric unlock is unavailable. Try again on a supported device.', label: 'Fingerprint / Face unlock', checking: false }); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { void refresh(); return; }
      if (enabled && !authenticating.current) setLocked(true);
    });
    return () => listener.remove();
  }, [enabled, refresh]);
  const authenticate = useCallback(async (promptMessage: string, allowPasscode = false) => {
    if (authenticating.current) return false;
    authenticating.current = true; setBusy(true); setError('');
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel', fallbackLabel: allowPasscode ? 'Use device passcode' : '', disableDeviceFallback: !allowPasscode, biometricsSecurityLevel: 'strong' });
      if (!result.success) { setError(result.error === 'user_cancel' || result.error === 'system_cancel' ? 'Unlock canceled. You can try again.' : 'Could not verify your identity. Try again or use your device passcode.'); return false; }
      return true;
    } catch { setError('Could not open device authentication. Please try again.'); return false; }
    finally { authenticating.current = false; setBusy(false); }
  }, []);
  const setEnabled = useCallback(async (next: boolean) => {
    if (next && !capability.available) return;
    if (await authenticate(next ? 'Enable biometric unlock for Zipp' : 'Turn off biometric unlock', !next)) { setEnabledState(next); setLocked(false); }
  }, [authenticate, capability.available]);
  const test = useCallback(async () => { if (await authenticate('Unlock Zipp', true)) setLocked(false); }, [authenticate]);
  return <Context.Provider value={{ ...capability, enabled, busy, error, refresh, setEnabled, test }}>{children}
    <Modal visible={enabled && locked} animationType="none" onRequestClose={() => {}} statusBarTranslucent>
      <View style={styles.lock}><Ionicons name="lock-closed-outline" size={46} color="#121B26" /><Text translate style={styles.title}>Zipp is locked</Text><Text translate style={styles.body}>Use your fingerprint, face, or device passcode to continue.</Text>{!!error && <Text translate accessibilityRole="alert" style={styles.error}>{error}</Text>}<View style={{ alignSelf: 'stretch' }}><ActionButton accessibilityLabel="Unlock Zipp" disabled={busy} onPress={() => { void test(); }}>{busy ? 'Verifying…' : 'Unlock Zipp'}</ActionButton></View></View>
    </Modal>
  </Context.Provider>;
}
export function useBiometricLock() { const value = useContext(Context); if (!value) throw new Error('BiometricProvider is required'); return value; }
const styles = StyleSheet.create({
  lock: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 32, gap: 24 },
  title: { fontSize: 27, fontWeight: '600', color: '#121B26' }, body: { fontSize: 16, lineHeight: 25, color: '#727970', textAlign: 'center' }, error: { fontSize: 14, color: '#B42318', textAlign: 'center' },
});
