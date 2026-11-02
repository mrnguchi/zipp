import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { useAppTheme } from '../hooks/useAppTheme';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';
import { useProfile } from '../contexts/ProfileContext';

export function PhoneVerificationScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route =
    useRoute<RouteProp<RootStackParamList, 'PhoneVerification'>>();
  const { phone, purpose } = route.params;
  const { profile, setProfile } = useProfile();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const codeInput = useRef<TextInputInstance>(null);
  const [code, setCode] = useState(__DEV__ && purpose === 'login' ? '123456' : '');
  const [error, setError] = useState('');

  const verifyCode = () => {
    Keyboard.dismiss();

    if (code.length !== 6) {
      setError(t('verification.invalidCode'));
      return;
    }

    setError('');
    // Preserve a known profile only for the same phone; the real login API will supply it later.
    setProfile(purpose === 'signup' ? { phone, name: route.params.name } : profile?.phone === phone ? profile : { phone });
    Alert.alert(
      purpose === 'signup'
        ? t('verification.signupComplete')
        : t('verification.loginComplete'),
    );
    if (purpose === 'signup') {
      navigation.replace('SelectRole');
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'RoleHome' }] });
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => navigation.goBack()}
            style={styles.back}
          >
            <Text style={[styles.backLabel, { color: colors.dark }]}>
              {t('common.back')}
            </Text>
          </Pressable>

          <Image
            accessibilityLabel="Zipp"
            source={require('../../assets/full logo.png')}
            resizeMode="contain"
            style={styles.logo}
          />

          <View style={[styles.iconBadge, { backgroundColor: colors.primarySoft }]}>
            <Image
              accessibilityLabel={t('verification.iconAccessibility')}
              source={require('../../assets/verify.png')}
              resizeMode="contain"
              style={styles.icon}
            />
          </View>

          <View style={styles.intro}>
            <Text style={[styles.heading, { color: colors.secondaryText }]}>
              {t('verification.title')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedText }]}>
              {t('verification.subtitle')}
            </Text>
            <Text style={[styles.phone, { color: colors.dark }]}>{phone}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('verification.codeLabel')}
            onPress={() => codeInput.current?.focus()}
            style={styles.codeRow}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.codeCell,
                  {
                    backgroundColor: colors.input,
                    borderColor:
                      index === code.length ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.codeDigit, { color: colors.dark }]}>
                  {code[index] ?? ''}
                </Text>
              </View>
            ))}
            <TextInput
              ref={codeInput}
              accessibilityLabel={t('verification.codeLabel')}
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => {
                setCode(value.replace(/\D/g, '').slice(0, 6));
                setError('');
              }}
              style={styles.hiddenCodeInput}
              value={code}
            />
          </Pressable>

          <Text style={[styles.notice, { color: colors.mutedText }]}>
            {t('verification.smsNotice')}
          </Text>

          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <ActionButton
              accessibilityLabel={t('verification.continue')}
              onPress={verifyCode}
            >
              {t('verification.continue')}
            </ActionButton>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('verification.resend')}
              onPress={() => Alert.alert(t('verification.resendUnavailable'))}
              style={styles.resend}
            >
              <Text style={[styles.resendText, { color: colors.primary }]}>
                {t('verification.resend')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 8,
  },
  back: {
    alignSelf: 'flex-start',
    minHeight: 30,
    justifyContent: 'center',
  },
  backLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  logo: {
    width: 155,
    height: 62,
    marginTop: 3,
  },
  iconBadge: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 33,
    marginTop: 26,
    marginBottom: 18,
  },
  icon: {
    width: 34,
    height: 34,
  },
  intro: {
    alignItems: 'center',
    gap: 6,
  },
  heading: {
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 32,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  phone: {
    fontSize: 15,
    fontWeight: '600',
  },
  codeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 7,
    marginTop: 30,
  },
  codeCell: {
    width: 44,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 13,
  },
  codeDigit: {
    fontSize: 20,
    fontWeight: '600',
  },
  hiddenCodeInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    opacity: 0,
    fontFamily: theme.typography.regular,
  },
  notice: {
    marginTop: 18,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  error: {
    alignSelf: 'stretch',
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  footer: {
    alignSelf: 'stretch',
    alignItems: 'stretch',
    marginTop: 'auto',
    paddingTop: 24,
    gap: 14,
  },
  resend: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
