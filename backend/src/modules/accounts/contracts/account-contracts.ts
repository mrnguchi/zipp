export interface ProfileInput {
  displayName?: string;
  language?: 'en' | 'fr';
  preferredMode?: 'customer' | 'driver';
  notificationsEnabled?: boolean;
  marketingConsent?: boolean;
}
export interface PlaceInput {
  kind: 'HOME' | 'WORK' | 'OTHER';
  name: string;
  label: string;
  latitude: number;
  longitude: number;
}
export interface PublicProfile {
  displayName: string;
  language: string;
  preferredMode: string;
  notificationsEnabled: boolean;
  marketingConsent: boolean;
}
export interface PublicPlace extends PlaceInput {
  id: string;
  createdAt: string;
}
