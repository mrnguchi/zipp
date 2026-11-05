import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

export type Profile = { phone: string; name?: string; firstName?: string; username?: string; email?: string;photoUri?:string;demoDriver?:'vehicle'|'bike' };
type ProfileContextValue = { profile: Profile | null; setProfile: (profile: Profile | null) => void; sessionRevision: number; logout: () => void;startSession:(profile:Profile)=>void };
const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionRevision,setSessionRevision] = useState(0);
  const logout = useCallback(() => {setProfile(null);setSessionRevision(value=>value+1);},[]);
  const startSession=useCallback((next:Profile)=>{setProfile(next);setSessionRevision(value=>value+1);},[]);
  const value = useMemo(() => ({ profile, setProfile, sessionRevision, logout,startSession }), [profile,sessionRevision,logout,startSession]);
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
