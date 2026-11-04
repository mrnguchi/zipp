import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import {Image, ScrollView, StyleSheet, View, useWindowDimensions} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { useAppTheme } from '../hooks/useAppTheme';
import type { RootStackParamList } from '../navigation/types';

export function WelcomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { height } = useWindowDimensions();
  const illustrationHeight = Math.min(340, Math.max(220, height * 0.31));

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        bounces={false}
      >
        <View style={styles.brand}>
          <Image
            accessibilityLabel="Zipp"
            source={require('../../assets/full logo.png')}
            resizeMode="contain"
            style={styles.logo}
          />
        </View>

        <View style={styles.intro}>
          <Text translate style={[styles.heading, { color: colors.navy }]}>
            {t('welcome.title')}
          </Text>
        </View>

        <View style={styles.lowerContent}>
          <Image
            accessibilityLabel={t('welcome.artAccessibility')}
            source={require('../../assets/splash screen.png')}
            resizeMode="contain"
            style={[styles.illustration, { height: illustrationHeight }]}
          />
          <Text translate
            numberOfLines={3}
            style={[styles.subtitle, { color: colors.mutedText }]}
          >
            {t('welcome.tagline')}
          </Text>
        </View>
        <View style={styles.button}>
          <ActionButton
            accessibilityLabel={t('welcome.getStarted')}
            onPress={() => navigation.navigate('SignupCustomer')}
          >
            {t('welcome.getStarted')}
          </ActionButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  brand: {
    alignItems: 'center',
    marginTop: 10,
  },
  logo: {
    width: 190,
    height: 70,
  },
  intro: {
    alignItems: 'center',
    marginTop: 4,
  },
  heading: {
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 31,
    textAlign: 'center',
  },
  illustration: {
    width: '100%',
  },
  lowerContent: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 310,
    fontWeight: '600',
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 'auto',
    paddingTop: 18,
  },
});
