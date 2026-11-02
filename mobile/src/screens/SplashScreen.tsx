import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Image, StyleSheet, View } from 'react-native';
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
        <Image
          accessibilityLabel="Zipp"
          source={require('../../assets/full logo.png')}
          resizeMode="contain"
          style={styles.logo}
        />
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
    height: 150,
  },
});
