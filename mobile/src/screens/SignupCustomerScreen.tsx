import { PasswordInput } from '../components/PasswordInput';
import { inputStyles } from '../constants/inputStyles';
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

export function SignupCustomerScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { height } = useWindowDimensions();
  const illustrationHeight = Math.min(260, Math.max(155, height * 0.23));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const createAccount = () => {
    if (!name.trim() || !phone.trim() || !password.trim()) {
      setError(t('signup.missingFields'));
      return;
    }

    setError('');
    navigation.navigate('PhoneVerification', {
      phone: phone.trim(),
      purpose: 'signup',
      name: name.trim(),
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
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.headerSection}>
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
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[styles.heading, { color: colors.secondaryText }]}
            >
              {t('signup.title')}
            </Text>
          </View>

          <Image
            accessibilityLabel={t('signup.illustration')}
            source={require('../../assets/signup avatar.png')}
            resizeMode="contain"
            style={[styles.illustration, { height: illustrationHeight }]}
          />

          <View style={styles.formSection}>
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.secondaryText }]}>
                  {t('signup.name')}
                </Text>
                <TextInput
                  accessibilityLabel={t('signup.name')}
                  autoCapitalize="words"
                  autoComplete="name"
                  onChangeText={(value) => {
                    setName(value);
                    setError('');
                  }}
                  placeholder={t('signup.namePlaceholder')}
                  placeholderTextColor={colors.mutedText}
                  returnKeyType="done"
                  style={[
                    styles.input,
                    { backgroundColor: colors.input, color: colors.dark },
                  ]}
                  value={name}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.secondaryText }]}>
                  {t('signup.phone')}
                </Text>
                <TextInput
                  accessibilityLabel={t('signup.phone')}
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  onChangeText={(value) => {
                    setPhone(value);
                    setError('');
                  }}
                  placeholder={t('signup.phonePlaceholder')}
                  placeholderTextColor={colors.mutedText}
                  returnKeyType="next"
                  style={[
                    styles.input,
                    { backgroundColor: colors.input, color: colors.dark },
                  ]}
                  value={phone}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.secondaryText }]}>
                  {t('signup.password')}
                </Text>
                <PasswordInput
                    accessibilityLabel={t('signup.password')}
                    autoComplete="new-password"
                    onChangeText={(value) => {
                      setPassword(value);
                      setError('');
                    }}
                    placeholder={t('signup.passwordPlaceholder')}
                    placeholderTextColor={colors.mutedText}
                    returnKeyType="done"
                    value={password}
                  />
              </View>
            </View>

            {error ? (
              <Text
                accessibilityRole="alert"
                style={[styles.error, { color: colors.error }]}
              >
                {error}
              </Text>
            ) : null}
          </View>

          <View style={styles.submit}>
            <ActionButton
              accessibilityLabel={t('signup.createAccount')}
              onPress={createAccount}
            >
              {t('signup.createAccount')}
            </ActionButton>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('signup.alreadyHaveAccount')} ${t('signup.signIn')}`}
              onPress={() => navigation.navigate('Login')}
              style={styles.signIn}
            >
              <Text style={[styles.signInPrompt, { color: colors.secondaryText }]}>
                {t('signup.alreadyHaveAccount')}{' '}
              </Text>
              <Text style={[styles.signInLabel, { color: colors.primary }]}>
                {t('signup.signIn')}
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
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSection: {
    width: '100%',
    alignItems: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    minHeight: 32,
    justifyContent: 'center',
  },
  backLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  logo: {
    width: 155,
    height: 64,
    marginTop: 8,
  },
  heading: {
    width: '100%',
    marginTop: 6,
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 31,
    textAlign: 'center',
  },
  illustration: {
    width: '76%',
    marginVertical: 2,
  },
  formSection: {
    width: '100%',
  },
  form: {
    alignSelf: 'stretch',
    gap: 16,
  },
  field: {
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  input: { ...inputStyles.field },
  passwordInput: { ...inputStyles.container, flexDirection: 'row', alignItems: 'center' },
  passwordText: { ...inputStyles.text, flex: 1 },
  showPassword: {
    fontSize: 11,
    fontWeight: '600',
  },
  error: {
    alignSelf: 'stretch',
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
  },
  submit: {
    alignSelf: 'stretch',
    alignItems: 'stretch',
    paddingTop: 18,
    gap: 16,
  },
  signIn: {
    alignSelf: 'center',
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInPrompt: {
    fontSize: 13,
  },
  signInLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
