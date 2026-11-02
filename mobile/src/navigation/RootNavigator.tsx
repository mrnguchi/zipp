import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainTabsScreen } from '../screens/MainTabsScreen';
import { RoleGuideScreen } from '../screens/RoleGuideScreen';
import { BookRideScreen } from '../screens/BookRideScreen';
import { SelectRoleScreen } from '../screens/SelectRoleScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PhoneVerificationScreen } from '../screens/PhoneVerificationScreen';
import { SignupCustomerScreen } from '../screens/SignupCustomerScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SignupCustomer" component={SignupCustomerScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PhoneVerification" component={PhoneVerificationScreen} />
      <Stack.Screen name="SelectRole" component={SelectRoleScreen} />
      <Stack.Screen
        name="RoleHome"
        component={MainTabsScreen}
        options={{
          // The map draws behind the status bar. The screen applies safe-area
          // spacing only to its interactive header, not its background.
          headerTransparent: true,
          contentStyle: { backgroundColor: 'transparent' },
          scrollEdgeEffects: { top: 'hidden', bottom: 'hidden' },
        }}
      />
      <Stack.Screen name="RoleGuide" component={RoleGuideScreen} />
      <Stack.Screen
        name="BookRide"
        component={BookRideScreen}
        options={{
          headerTransparent: true,
          contentStyle: { backgroundColor: 'transparent' },
          scrollEdgeEffects: { top: 'hidden', bottom: 'hidden' },
        }}
      />
    </Stack.Navigator>
  );
}
