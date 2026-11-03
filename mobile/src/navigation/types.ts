import type { UserRole } from '../types/domain';
import type { MapCoordinate } from '../components/maps/mapGeometry';

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
  BookRide: { focusDestination?: boolean; destinationLabel?: string; destinationCoordinate?: MapCoordinate } | undefined;
  SavedPlaces: { kind?: 'home' | 'work' | 'other'; location?: { label: string; coordinate: MapCoordinate } } | undefined;
  Delivery: undefined;
};
