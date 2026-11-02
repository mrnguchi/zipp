import type { UserRole } from '../types/domain';

export type RootStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  SignupCustomer: undefined;
  Login: undefined;
  PhoneVerification: {
    phone: string;
    purpose: 'signup' | 'login';
    name?: string;
  };
  SelectRole: undefined;
  RoleHome: { openWallet?: boolean } | undefined;
  RoleGuide: { role: 'rider' | 'driver' };
  BookRide: { focusDestination?: boolean; destinationLabel?: string } | undefined;
};
