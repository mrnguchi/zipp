import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import {Image, StyleSheet, View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../hooks/useAppTheme';
import type { RootStackParamList } from '../navigation/types';

export function SplashScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useAppTheme();

  useEffect(() => {
    // This delay is for UI development only.
    const timeout = setTimeout(() => {
      navigation.replace('Welcome');
    }, 5000);

    return () => clearTimeout(timeout);
  }, [navigation]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.yellow }]}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <View accessible accessibilityLabel="Zipp" style={styles.logo}>
          <Image source={require('../../assets/full logo.png')} resizeMode="contain" style={styles.logoArtwork} />
          {/* Clip a black-tinted copy to the dot, preserving the green Z and wordmark. */}
          <View pointerEvents="none" style={styles.dotClip}>
            <Image source={require('../../assets/full logo.png')} resizeMode="contain" style={styles.blackDotArtwork} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 220,
    height: 220 * 725 / 2170,
  },
  logoArtwork: {
    width: 220,
    height: 220 * 725 / 2170,
  },
  // Bounds in the original 2170 × 725 logo around the isolated i dot.
  dotClip: {
    position: 'absolute',
    left: 220 * 1130 / 2170,
    top: 220 * 65 / 2170,
    width: 220 * 150 / 2170,
    height: 220 * 145 / 2170,
    overflow: 'hidden',
  },
  blackDotArtwork: {
    position: 'absolute',
    left: -220 * 1130 / 2170,
    top: -220 * 65 / 2170,
    width: 220,
    height: 220 * 725 / 2170,
    tintColor: '#000000',
  },
});
