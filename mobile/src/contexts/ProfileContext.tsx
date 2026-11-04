import { createContext, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

export type Profile = { phone: string; name?: string; firstName?: string; username?: string; email?: string };
type ProfileContextValue = { profile: Profile | null; setProfile: (profile: Profile | null) => void };
const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const value = useMemo(() => ({ profile, setProfile }), [profile]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used within ProfileProvider.');
  return context;
}

export function profileDisplayName(profile: Profile | null) {
  return profile?.firstName?.trim() || profile?.username?.trim() || profile?.name?.trim().split(/\s+/)[0] || null;
}
