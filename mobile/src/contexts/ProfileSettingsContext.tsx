import { createContext, useCallback, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { defaultNotificationSounds } from '../services/notificationSounds';
import type { NotificationSounds } from '../services/notificationSounds';

export type NotificationSettings = { ride: boolean; wallet: boolean; info: boolean };
export type SupportDraft = { subject: string; email: string; message: string };
type Settings = {
  notifications: NotificationSettings;
  setNotifications: (settings: NotificationSettings) => void;
  sounds: NotificationSounds;
  setSounds: (sounds: NotificationSounds) => void;
  supportDraft: SupportDraft;
  setSupportDraft: (draft: SupportDraft) => void;
  changePreviewPassword: (current: string, next: string) => boolean;
  resetPreviewPassword: (next: string) => void;
};
const Context = createContext<Settings | null>(null);
export function ProfileSettingsProvider({ children }: PropsWithChildren) {
  const [notifications, setNotifications] = useState<NotificationSettings>({ ride: true, wallet: true, info: true });
  const [sounds, setSounds] = useState<NotificationSounds>(defaultNotificationSounds);
  const [supportDraft, setSupportDraft] = useState<SupportDraft>({ subject: '', email: '', message: '' });
  const [previewPassword, setPreviewPassword] = useState('ZippDemo123!');
  const changePreviewPassword = useCallback((current: string, next: string) => {
    if (!__DEV__ || current !== previewPassword) return false;
    setPreviewPassword(next);
    return true;
  }, [previewPassword]);
  const resetPreviewPassword = useCallback((next:string) => { if(__DEV__ && next.length>=8 && next.length<=128)setPreviewPassword(next); }, []);
  return <Context.Provider value={{ notifications, setNotifications, sounds, setSounds, supportDraft, setSupportDraft, changePreviewPassword, resetPreviewPassword }}>{children}</Context.Provider>;
}
export function useProfileSettings() {
  const settings = useContext(Context);
  if (!settings) throw new Error('ProfileSettingsProvider is required');
  return settings;
}
