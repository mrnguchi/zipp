import {KeyboardAwareScrollView as ScrollView} from '../components/KeyboardAwareScrollView';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from '../components/LocalizedNative';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import {Image, KeyboardAvoidingView, Platform, StyleSheet, View, useWindowDimensions, } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '../components/AppText';
import { FormField } from '../components/FormField';
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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState('');

  const createAccount = () => {
    if (!name.trim() || !phone.trim() || !password.trim()) {
      setError(t('signup.missingFields'));
      return;
    }

    if(!/^\+?\d{9,15}$/.test(phone.replace(/[\s()-]/g,''))){setError('Enter a valid phone number.');return;}
    if(password.length<8){setError('Use at least 8 characters for your password.');return;}
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              <Text translate style={[styles.backLabel, { color: colors.dark }]}>
                {t('common.back')}
              </Text>
            </Pressable>

            <Image
              accessibilityLabel="Zipp"
              source={require('../../assets/full logo.png')}
              resizeMode="contain"
              style={styles.logo}
            />
            <Text translate
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
              <FormField label={t('signup.name')} accessibilityLabel={t('signup.name')} autoCapitalize="words" autoComplete="name" value={name} onChangeText={value=>{setName(value);setError('');}} placeholder={t('signup.namePlaceholder')} maxLength={100} validate={value=>!value.trim()?'Enter your full name.':undefined}/>
              <FormField label={t('signup.phone')} accessibilityLabel={t('signup.phone')} autoComplete="tel" keyboardType="phone-pad" value={phone} onChangeText={value=>{setPhone(value);setError('');}} placeholder={t('signup.phonePlaceholder')} maxLength={18} validate={value=>!/^\+?\d{9,15}$/.test(value.replace(/[\s()-]/g,''))?'Enter a valid phone number.':undefined}/>
              <FormField label={t('signup.password')} accessibilityLabel={t('signup.password')} autoComplete="new-password" autoCapitalize="none" autoCorrect={false} value={password} onChangeText={value=>{setPassword(value);setError('');}} secureTextEntry={!passwordVisible} placeholder={t('signup.passwordPlaceholder')} hint="Use at least 8 characters." maxLength={128} onSubmitEditing={createAccount} validate={value=>value.length<8?'Use at least 8 characters.':undefined}/>
              <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible?t('signup.hidePassword'):t('signup.showPassword')} onPress={()=>setPasswordVisible(!passwordVisible)} style={{alignSelf:'flex-end',minHeight:44,justifyContent:'center'}}><Text translate style={{fontSize:14,fontWeight:'600',color:colors.primaryDark}}>{passwordVisible?t('signup.hidePassword'):t('signup.showPassword')}</Text></Pressable>
            </View>

            {error ? (
              <Text translate
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
              <Text translate style={[styles.signInPrompt, { color: colors.secondaryText }]}>
                {t('signup.alreadyHaveAccount')}{' '}
              </Text>
              <Text translate style={[styles.signInLabel, { color: colors.primary }]}>
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
  input: {
    minHeight: 50,
    borderRadius: 22,
    paddingHorizontal: 15,
    fontSize: 13,
    fontFamily: theme.typography.regular,
  },
  passwordInput: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingLeft: 15,
    paddingRight: 13,
  },
  passwordText: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: theme.typography.regular,
  },
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
