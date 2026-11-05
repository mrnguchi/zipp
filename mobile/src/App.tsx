import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  Poppins_900Black,
} from '@expo-google-fonts/poppins';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RoleProvider } from './contexts/RoleContext';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { DriverOnboardingProvider } from './contexts/DriverOnboardingContext';
import { DriverWorkspaceProvider } from './contexts/DriverWorkspaceContext';
import {DriverMoneyProvider} from './contexts/DriverMoneyContext';
import { ProfileSettingsProvider } from './contexts/ProfileSettingsContext';
import { BiometricProvider } from './contexts/BiometricContext';
import { NotificationAudioProvider } from './contexts/NotificationAudioContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { WalletProvider } from './contexts/WalletContext';
import { MessagingProvider } from './contexts/MessagingContext';
import { ActivityProvider } from './contexts/ActivityContext';
import { SavedPlacesProvider } from './contexts/SavedPlacesContext';
import { PasswordRecoveryProvider } from './contexts/PasswordRecoveryContext';
import {languageReady} from './i18n';
import {useEffect,useState} from 'react';
import { RootNavigator } from './navigation/RootNavigator';
import { queryClient } from './query/client';

export default function App() {
  const [languageLoaded,setLanguageLoaded]=useState(false);
  useEffect(()=>{void languageReady.then(()=>setLanguageLoaded(true),()=>setLanguageLoaded(true));},[]);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Poppins_900Black,
  });

  if (!fontsLoaded || !languageLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <ProfileProvider>
          <SessionProviders />
          </ProfileProvider>
        </RoleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}


// Remount the whole signed-in session on logout so private drafts, wallet state,
// notifications, biometric locks, and the old navigation stack cannot survive.
function SessionProviders() {
  const {sessionRevision,profile} = useProfile();
  return (
          <ProfileSettingsProvider key={sessionRevision}>
          <DriverOnboardingProvider>
          <BiometricProvider>
          <NotificationAudioProvider>
          <SavedPlacesProvider>
          <NotificationProvider>
          <WalletProvider>
          <ActivityProvider>
          <MessagingProvider>
          <DriverWorkspaceProvider>
          <DriverMoneyProvider>
          <PasswordRecoveryProvider>
          <NavigationContainer>
            <RootNavigator initialRouteName={__DEV__&&profile?.demoDriver?'RoleHome':sessionRevision > 0 ? 'Login' : 'Splash'} />
          </NavigationContainer>
          </PasswordRecoveryProvider>
          </DriverMoneyProvider>
          </DriverWorkspaceProvider>
          </MessagingProvider>
          </ActivityProvider>
          </WalletProvider>
          </NotificationProvider>
          </SavedPlacesProvider>
          </NotificationAudioProvider>
          </BiometricProvider>
          </DriverOnboardingProvider>
          </ProfileSettingsProvider>
  );
}
