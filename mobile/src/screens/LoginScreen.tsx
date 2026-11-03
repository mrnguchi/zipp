import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { useAppTheme } from '../hooks/useAppTheme';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../theme';

export function LoginScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { height } = useWindowDimensions();
  const illustrationHeight = Math.min(300, Math.max(190, height * 0.28));
  const [phone, setPhone] = useState(__DEV__ ? '612345678' : '');
  const [password, setPassword] = useState(__DEV__ ? 'ZippDev123!' : '');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');

  const submitLogin = () => {
    if (!phone.trim() || !password.trim()) {
      setError(t('login.missingFields'));
      return;
    }

    setError('');
    navigation.navigate('PhoneVerification', {
      phone: phone.trim(),
      purpose: 'login',
    });
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

          <View style={styles.intro}>
            <Text style={[styles.heading, { color: colors.secondaryText }]}>
              {t('login.title')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedText }]}>
              {t('login.subtitle')}
            </Text>
          </View>

          <Image
            accessibilityLabel={t('login.illustration')}
            source={require('../../assets/Welcoming Login Illustration with Emerald Badge.png')}
            resizeMode="contain"
            style={[styles.illustration, { height: illustrationHeight }]}
          />

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.secondaryText }]}>
                {t('login.phone')}
              </Text>
              <TextInput
                accessibilityLabel={t('login.phone')}
                autoComplete="tel"
                keyboardType="phone-pad"
                onChangeText={(value) => {
                  setPhone(value);
                  setError('');
                }}
                placeholder={t('login.phonePlaceholder')}
                placeholderTextColor={colors.mutedText}
                returnKeyType="done"
                style={[
                  styles.input,
                  { backgroundColor: colors.input, color: colors.dark },
                ]}
                value={phone}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.secondaryText }]}>
                {t('login.password')}
              </Text>
              <View style={[styles.passwordInput, { backgroundColor: colors.input }]}>
                <TextInput
                  accessibilityLabel={t('login.password')}
                  autoComplete="current-password"
                  onChangeText={(value) => {
                    setPassword(value);
                    setError('');
                  }}
                  placeholder={t('login.passwordPlaceholder')}
                  placeholderTextColor={colors.mutedText}
                  returnKeyType="done"
                  secureTextEntry={!passwordVisible}
                  style={[styles.passwordText, { color: colors.dark }]}
                  value={password}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    passwordVisible
                      ? t('login.hidePassword')
                      : t('login.showPassword')
                  }
                  onPress={() => setPasswordVisible((visible) => !visible)}
                >
                  <Text style={[styles.showPassword, { color: colors.secondaryText }]}>
                    {passwordVisible
                      ? t('login.hidePassword')
                      : t('login.showPassword')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <ActionButton
              accessibilityLabel={t('login.submit')}
              onPress={submitLogin}
            >
              {t('login.submit')}
            </ActionButton>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('signup.noAccount')} ${t('login.createAccount')}`}
              onPress={() => navigation.navigate('SignupCustomer')}
              style={styles.createAccount}
            >
              <Text style={[styles.createAccountPrompt, { color: colors.secondaryText }]}>
                {t('signup.noAccount')}{' '}
              </Text>
              <Text style={[styles.createAccountLabel, { color: colors.primary }]}>
                {t('login.createAccount')}
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
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
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
  intro: {
    alignItems: 'center',
    gap: 4,
  },
  heading: {
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 33,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  illustration: {
    width: '78%',
    alignSelf: 'center',
    marginVertical: 8,
  },
  form: {
    width: '100%',
    gap: 14,
    marginTop: 'auto',
  },
  field: {
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    minHeight: 50,
    borderRadius: 25,
    paddingHorizontal: 16,
    fontSize: 14,
    fontFamily: theme.typography.regular,
  },
  passwordInput: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 25,
    paddingLeft: 16,
    paddingRight: 14,
  },
  passwordText: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: theme.typography.regular,
  },
  showPassword: {
    fontSize: 12,
    fontWeight: '600',
  },
  error: {
    alignSelf: 'stretch',
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
  },
  footer: {
    alignSelf: 'stretch',
    alignItems: 'stretch',
    marginTop: 20,
    paddingTop: 0,
    gap: 16,
  },
  createAccount: {
    alignSelf: 'center',
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAccountPrompt: {
    fontSize: 13,
  },
  createAccountLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
