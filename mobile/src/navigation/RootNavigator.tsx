import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainTabsScreen } from '../screens/MainTabsScreen';
import { ConversationScreen } from '../screens/messaging/ConversationScreen';
import { ConversationDetailsScreen, ConversationSearchScreen, NewConversationScreen } from '../screens/messaging/ConversationDetailsScreen';
import { AttachmentReviewScreen, MessageMediaScreen } from '../screens/messaging/MessageMediaScreen';
import { VoiceMessageScreen } from '../screens/messaging/VoiceMessageScreen';
import { CallDetailsScreen, CallScreen } from '../screens/messaging/CallScreen';
import { ProfileDetailScreen } from '../screens/profile/ProfileDetailScreen';
import { BiometricScreen } from '../screens/profile/BiometricScreen';
import { NotificationSoundScreen } from '../screens/profile/NotificationSoundScreen';
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
      <Stack.Screen name="Conversation" component={ConversationScreen} />
      <Stack.Screen name="ConversationDetails" component={ConversationDetailsScreen} />
      <Stack.Screen name="ConversationSearch" component={ConversationSearchScreen} />
      <Stack.Screen name="NewConversation" component={NewConversationScreen} />
      <Stack.Screen name="AttachmentReview" component={AttachmentReviewScreen} />
      <Stack.Screen name="MessageMedia" component={MessageMediaScreen} />
      <Stack.Screen name="VoiceMessage" component={VoiceMessageScreen} />
      <Stack.Screen name="Call" component={CallScreen} options={{gestureEnabled:false}} />
      <Stack.Screen name="CallDetails" component={CallDetailsScreen} />
      <Stack.Screen name="BiometricUnlock" component={BiometricScreen} />
      <Stack.Screen name="NotificationSound" component={NotificationSoundScreen} />
      {(['ManageProfile', 'PasswordSecurity', 'ChangePassword', 'ProfileNotifications', 'ProfileLanguage', 'ProfileFAQ', 'FAQArticle', 'ContactSupport', 'ReviewSupport', 'AboutUs'] as const).map(name => <Stack.Screen key={name} name={name} component={ProfileDetailScreen} />)}
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
