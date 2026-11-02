import { useState } from 'react';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNotificationAudio } from '../../contexts/NotificationAudioContext';
import { useProfileSettings } from '../../contexts/ProfileSettingsContext';
import { notificationEvents, soundOptions } from '../../services/notificationSounds';
import type { NotificationSound } from '../../services/notificationSounds';
import type { RootStackParamList } from '../../navigation/types';
import { ProfileFrame } from './ProfileDetailScreen';
import { colors } from '../../constants/colors';

export function NotificationSoundScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'NotificationSound'>>();
  const { sounds, setSounds } = useProfileSettings();
  const playSound = useNotificationAudio();
  const [error, setError] = useState('');
  const event = notificationEvents.find(event => event.key === params.event);
  async function preview(sound: NotificationSound) {
    setError('');
    try { await playSound(sound); } catch { setError('Could not play this sound. Check your volume and try again.'); }
  }
  return <ProfileFrame title="Notification Sound"><Text style={s.heading}>{event?.label}</Text><Text style={s.body}>Choose a tone for this notification. Changes apply immediately to in-app alerts.</Text>
    <View style={s.card}>{soundOptions.map((sound,index) => <View key={sound.id} style={[s.row,index>0&&s.divider]}>
      <Pressable accessibilityRole="radio" accessibilityLabel={sound.label} accessibilityState={{checked:sounds[params.event]===sound.id}} style={s.option} onPress={() => { setSounds({...sounds,[params.event]:sound.id}); void preview(sound.id); }}><Ionicons name={sound.id==='silent'?'volume-mute-outline':'musical-note-outline'} size={22} color={colors.primary} /><Text style={s.label}>{sound.label}</Text><Ionicons name={sounds[params.event]===sound.id?'checkmark-circle':'ellipse-outline'} size={23} color={sounds[params.event]===sound.id?'#0B9658':'#C5C9C1'} /></Pressable>
      {sound.id!=='silent'&&<Pressable accessibilityRole="button" accessibilityLabel={`Preview ${sound.label}`} style={s.preview} onPress={() => { void preview(sound.id); }}><Ionicons name="play-outline" size={22} color={colors.primary} /></Pressable>}
    </View>)}</View>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Text style={s.body}>Your phone’s volume and silent mode still apply. Sound choices last for this app session.</Text>
  </ProfileFrame>;
}
const s=StyleSheet.create({heading:{fontSize:22,fontWeight:'600',color:'#292D2C'},body:{fontSize:14,lineHeight:23,color:'#777D76'},card:{borderRadius:12,backgroundColor:'#FFFFFF',paddingHorizontal:16},row:{flexDirection:'row',alignItems:'center',minHeight:64},option:{flex:1,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:18},label:{flex:1,fontSize:16,color:'#292D2C'},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#EFF0ED'},preview:{width:44,height:44,alignItems:'center',justifyContent:'center',marginLeft:10,borderRadius:22,backgroundColor:colors.yellow+'24'},error:{color:'#B42318',fontSize:14,lineHeight:21}});
