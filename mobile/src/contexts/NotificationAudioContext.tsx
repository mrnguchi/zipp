import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import type { PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import type { NotificationSound } from '../services/notificationSounds';

const Context = createContext<((sound: NotificationSound) => Promise<void>) | null>(null);
export function NotificationAudioProvider({ children }: PropsWithChildren) {
  const chime = useAudioPlayer(require('../../assets/sounds/chime.wav'));
  const bell = useAudioPlayer(require('../../assets/sounds/bell.wav'));
  const pulse = useAudioPlayer(require('../../assets/sounds/pulse.wav'));
  const request = useRef(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { request.current++; chime.pause(); bell.pause(); pulse.pause(); }
    });
    return () => subscription.remove();
  }, [chime, bell, pulse]);
  const play = useCallback(async (sound: NotificationSound) => {
    const id = ++request.current;
    chime.pause(); bell.pause(); pulse.pause();
    if (sound === 'silent' || AppState.currentState !== 'active') return;
    await setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
    const player = { chime, bell, pulse }[sound];
    await player.seekTo(0);
    if (id === request.current && AppState.currentState === 'active') player.play();
  }, [chime, bell, pulse]);
  return <Context.Provider value={play}>{children}</Context.Provider>;
}
export function useNotificationAudio() {
  const audio = useContext(Context);
  if (!audio) throw new Error('NotificationAudioProvider is required');
  return audio;
}
