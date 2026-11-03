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
import { ProfileProvider } from './contexts/ProfileContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { WalletProvider } from './contexts/WalletContext';
import { ActivityProvider } from './contexts/ActivityContext';
import { SavedPlacesProvider } from './contexts/SavedPlacesContext';
import './i18n';
import { RootNavigator } from './navigation/RootNavigator';
import { queryClient } from './query/client';

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Poppins_900Black,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <ProfileProvider>
          <SavedPlacesProvider>
          <NotificationProvider>
          <WalletProvider>
          <ActivityProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          </ActivityProvider>
          </WalletProvider>
          </NotificationProvider>
          </SavedPlacesProvider>
          </ProfileProvider>
        </RoleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
