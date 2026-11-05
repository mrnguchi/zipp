import { inputStyles } from '../../constants/inputStyles';
import {UploadCard} from '../../components/UploadCard';
import {KeyboardAwareScrollView as ScrollView} from '../../components/KeyboardAwareScrollView';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from '../../components/LocalizedNative';
import {AppText as Text} from '../../components/AppText';
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { MessagingIcon as Ionicons } from '../../components/MessagingIcon';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {ActivityIndicator, AppState, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '../../constants/colors';
import { useMessaging } from '../../contexts/MessagingContext';
import type { RootStackParamList } from '../../navigation/types';
import { formatCallDuration } from '../../services/messaging';
import type { ChatMessage } from '../../services/messaging';
import { Avatar, dateLabel, EmptyState, IconButton, timeLabel, TripCard, SharedLocationCard, MessageBackButton, ui } from './MessagingUI';

function VoiceBubble({message,mine}:{message:ChatMessage;mine:boolean}) {
  const player=useAudioPlayer(message.uri?{uri:message.uri}:null);const status=useAudioPlayerStatus(player);const [error,setError]=useState('');
  const focused=useIsFocused();
  useEffect(()=>{if(!focused)player.pause();},[focused,player]);
  useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});return()=>listener.remove();},[player]);
  async function play(){try{setError('');if(status.playing)player.pause();else{await setAudioModeAsync({allowsRecording:false,playsInSilentMode:false});if(status.didJustFinish||status.currentTime>=status.duration)await player.seekTo(0);player.play();}}catch{setError('Audio unavailable.');}}
  return <View><View style={s.voice}><Pressable accessibilityRole="button" accessibilityLabel={status.playing?'Pause voice message':'Play voice message'} onPress={()=>{void play();}} style={s.voicePlay}><Ionicons name={status.playing?'pause':'play'} size={21} color={mine?colors.white:colors.primary} /></Pressable><View style={s.wave}>{[10,20,14,28,18,32,14,22,30,16,24,12,28,18,10].map((height,index)=><View key={index} style={{width:3,height,borderRadius:2,backgroundColor:mine?'#FFFFFF99':colors.primary+'80'}} />)}</View><Text translate style={{fontSize:11,color:mine?colors.white:colors.primaryDark}}>{formatCallDuration(status.playing?status.currentTime:message.duration??status.duration)}</Text></View>{!!error&&<Text translate style={{fontSize:11,color:mine?'#FFFFFF':colors.error}}>{error}</Text>}</View>;
}
export function ConversationScreen() {
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();const {params}=useRoute<RouteProp<RootStackParamList,'Conversation'>>();
  const {conversations,drafts,send,markRead,setDraft}=useMessaging();const conversation=conversations.find(item=>item.id===params.conversationId);
  const draft=drafts[params.conversationId]??'';const scroll=useRef<ComponentRef<typeof ScrollView>>(null);const input=useRef<ComponentRef<typeof TextInput>>(null);
  const [sheet,setSheet]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const request=useRef(0);
  useEffect(()=>{markRead(params.conversationId);},[params.conversationId,conversation?.messages.length,markRead]);
  useEffect(()=>()=>{request.current++;},[]);
  if(!conversation)return <SafeAreaView style={ui.screen}><MessageBackButton onPress={()=>navigation.goBack()} /><EmptyState title="Conversation unavailable" body="Return to Messages and select another conversation." /></SafeAreaView>;
  function submit(){if(!draft.trim())return;send(params.conversationId,{kind:'text',text:draft});setDraft(params.conversationId,'');}
  async function attach(kind:'image'|'location',source:'camera'|'gallery'='gallery') {
    const id=++request.current;setLoading(true);setError('');
    try {
      if(kind==='image'){
        if(source==='camera'){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Allow camera access to photograph your document, or choose a file instead.');}
        const options:ImagePicker.ImagePickerOptions={mediaTypes:['images'],quality:0.8,allowsEditing:false};
        const result=source==='camera'?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
        if(result.canceled||id!==request.current)return;
        setSheet(false);navigation.navigate('AttachmentReview',{conversationId:params.conversationId,kind:'image',uri:result.assets[0].uri});
      } else {
        const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw Error('Location access was not allowed. You can send a nearby landmark as a text message instead.');
        const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});if(id!==request.current)return;
        setSheet(false);navigation.navigate('AttachmentReview',{conversationId:params.conversationId,kind:'location',coordinate:{latitude:position.coords.latitude,longitude:position.coords.longitude},label:'My shared location'});
      }
    }catch(problem){if(id===request.current)setError(problem instanceof Error?problem.message:'Could not prepare the attachment. Try again.');}
    finally{if(id===request.current)setLoading(false);}
  }
  const person=conversation;
  return <SafeAreaView style={ui.screen} edges={['top','left','right','bottom']}><View style={s.chatHeader}>
    <MessageBackButton onPress={()=>navigation.goBack()} />
    <Pressable accessibilityRole="button" accessibilityLabel="Conversation details" style={s.contactHeader} onPress={()=>navigation.navigate('ConversationDetails',{conversationId:person.id})}><Avatar conversation={person} size={44}/><View style={s.contactCopy}><Text numberOfLines={1} style={s.contactName}>{person.name}</Text><Text translate style={s.contactRole}>{person.role}</Text></View><Ionicons name="chevron-forward" size={15} color={colors.secondaryText}/></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Voice call" onPress={()=>navigation.navigate('Call',{conversationId:person.id,mode:'voice'})} style={s.callButton}><Ionicons name="call-outline" size={21} color={colors.primary}/></Pressable>
  </View>
  <KeyboardAvoidingView style={ui.flex} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={0}>
    <ScrollView ref={scroll} style={s.chatScroll} contentContainerStyle={s.messages} onContentSizeChange={()=>scroll.current?.scrollToEnd({animated:false})} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {person.messages.length===0&&<View style={s.greeting}><Avatar conversation={person} size={72} /><Text style={ui.medium}>Say hello to {person.name.split(' ')[0]}</Text><Text translate style={[ui.body,{textAlign:'center'}]}>Keep pickup details and trip updates in one place.</Text></View>}
      {person.messages.map((message,index)=>{const mine=message.author==='me';const previous=person.messages[index-1];const showTime=!previous||message.createdAt-previous.createdAt>10*60000||dateLabel(previous.createdAt)!==dateLabel(message.createdAt);return <View key={message.id}>
        {showTime&&<Text translate style={s.timeSeparator}>{dateLabel(message.createdAt)} · {timeLabel(message.createdAt)}</Text>}
        <View style={[s.messageRow,mine&&s.myRow]}>{!mine&&<Avatar conversation={person} size={27} />}<View style={[s.messageColumn,mine&&{alignItems:'flex-end'}]}>
          {!mine&&<Text style={s.senderName}>{person.name}</Text>}
          <Pressable disabled={message.kind==='text'||message.kind==='voice'} accessibilityRole={message.kind==='image'||message.kind==='location'||message.kind==='trip'?'button':undefined} accessibilityLabel={message.kind==='trip'?'View trip details':undefined} onPress={()=>message.kind==='trip'?navigation.navigate('ConversationDetails',{conversationId:person.id}):navigation.navigate('MessageMedia',{conversationId:person.id,messageId:message.id})} style={[s.bubble,mine?s.outgoing:s.incoming,message.kind==='image'&&s.imageBubble,(message.kind==='trip'||message.kind==='location')&&s.richBubble]}>
            {message.kind==='trip'&&person.trip?<TripCard trip={person.trip} inChat />:message.kind==='image'?<><Image source={{uri:message.uri}} style={s.messageImage} resizeMode="cover" />{!!message.text&&<Text style={[s.messageText,mine&&s.myText,{padding:10}]}>{message.text}</Text>}</>:
            message.kind==='voice'?<VoiceBubble message={message} mine={mine} />:
            message.kind==='location'?<SharedLocationCard label={message.label} coordinate={message.coordinate} mine={mine}/>:
            <Text style={[s.messageText,mine&&s.myText]}>{message.text}</Text>}
          </Pressable>
          {mine&&<Text translate style={s.localStatus}>On this device · {timeLabel(message.createdAt)}</Text>}
        </View></View>
      </View>;})}
    </ScrollView>
    <View style={s.composerDock}>
    <ScrollView horizontal style={s.quickRepliesViewport} showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickReplies} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never">{['I’m at the pickup point','Please call me','I’m on my way'].map(reply=><Pressable key={reply} accessibilityRole="button" onPress={()=>{setDraft(person.id,reply);input.current?.focus();}} style={s.quickReply}><Text translate numberOfLines={1} style={s.quickText}>{reply}</Text></Pressable>)}</ScrollView>
    <View style={s.composer}><IconButton icon="add" label="Add attachment" onPress={()=>{setError('');setSheet(true);}} /><View style={s.inputWrap}><TextInput ref={input} accessibilityLabel="Message" placeholder="Message…" placeholderTextColor="#A4AA9E" value={draft} onChangeText={text=>setDraft(person.id,text)} multiline maxLength={2000} style={s.input} /><Pressable accessibilityRole="button" accessibilityLabel="Record voice message" onPress={()=>navigation.navigate('VoiceMessage',{conversationId:person.id})} style={s.mic}><Ionicons name="mic-outline" size={23} color="#989F91" /></Pressable></View><Pressable accessibilityRole="button" accessibilityLabel="Save message to conversation" disabled={!draft.trim()} onPress={submit} style={[s.send,!draft.trim()&&{opacity:0.35}]}><Ionicons name="arrow-up" size={24} color={colors.white} /></Pressable></View>
    </View>
  </KeyboardAvoidingView>
  <Modal visible={sheet} transparent animationType="slide" onRequestClose={()=>{request.current++;setLoading(false);setSheet(false);}}><View style={s.sheetBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="Close attachments" style={ui.flex} onPress={()=>{request.current++;setLoading(false);setSheet(false);}} /><View style={s.sheet}><View style={s.sheetHandle} /><Text translate style={ui.heading}>Add to conversation</Text><Text translate style={ui.small}>Review your attachment before adding it.</Text>{loading?<ActivityIndicator color={colors.primary} style={{padding:24}} />:<><UploadCard title="Photo" description="Review your attachment before adding it." onCamera={()=>{void attach('image','camera');}} onGallery={()=>{void attach('image');}}/>{([{kind:'location',icon:'location-outline',title:'Share location'}] as const).map(option=><Pressable key={option.kind} accessibilityRole="button" onPress={()=>{void attach(option.kind);}} style={ui.row}><Ionicons name={option.icon} size={25} color={colors.primary} /><Text translate style={ui.medium}>{option.title}</Text></Pressable>)}{person.trip&&<Pressable accessibilityRole="button" onPress={()=>{setSheet(false);navigation.navigate('AttachmentReview',{conversationId:person.id,kind:'trip'});}} style={ui.row}><Ionicons name="car-outline" size={25} color={colors.primary} /><Text translate style={ui.medium}>Trip details</Text></Pressable>}</>}{!!error&&<Text translate accessibilityRole="alert" style={s.error}>{error}</Text>}</View></View></Modal>
  </SafeAreaView>;
}
const s=StyleSheet.create({chatHeader:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:14,gap:14,backgroundColor:colors.white,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},contactHeader:{flex:1,flexDirection:'row',alignItems:'center',gap:11,minWidth:0},contactName:{fontSize:16,lineHeight:24,fontWeight:'600',color:colors.navy},contactChevron:{color:colors.secondaryText},contactRole:{fontSize:11,lineHeight:18,color:colors.secondaryText},headerCalls:{flexDirection:'row',gap:3},chatScroll:{flex:1},messages:{padding:18,paddingBottom:20,gap:14,flexGrow:1},previewNote:{fontSize:11,lineHeight:18,color:colors.secondaryText,textAlign:'center',marginBottom:5},timeSeparator:{fontSize:12,color:colors.secondaryText,textAlign:'center',marginVertical:14},messageRow:{flexDirection:'row',alignItems:'flex-end',gap:7},myRow:{justifyContent:'flex-end'},messageColumn:{maxWidth:'83%',gap:4,flexShrink:1,alignItems:'flex-start'},senderName:{fontSize:12,color:colors.secondaryText,marginLeft:10,marginBottom:1},bubble:{paddingHorizontal:15,paddingVertical:11,borderRadius:21},outgoing:{backgroundColor:colors.primary,borderBottomRightRadius:5},incoming:{backgroundColor:colors.input,borderBottomLeftRadius:7},messageText:{fontSize:17,lineHeight:25,color:colors.navy},myText:{color:colors.white},localStatus:{fontSize:11,color:colors.secondaryText,paddingRight:5,marginTop:2},imageBubble:{paddingHorizontal:4,paddingVertical:4,overflow:'hidden'},messageImage:{width:224,height:190,borderRadius:16},locationBubble:{minWidth:180,gap:7},locationHint:{fontSize:13,color:colors.secondaryText},composerDock:{flexShrink:0,backgroundColor:colors.white,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#F0F0F0'},quickRepliesViewport:{flexGrow:0,flexShrink:0,minHeight:62},quickReplies:{paddingHorizontal:18,paddingVertical:10,gap:10,alignItems:'center'},quickReply:{minHeight:42,justifyContent:'center',backgroundColor:colors.input,borderRadius:21,paddingHorizontal:15,paddingVertical:10},quickText:{fontSize:14,lineHeight:20,fontWeight:'500',color:colors.secondaryText},composer:{flexDirection:'row',alignItems:'flex-end',paddingHorizontal:12,paddingBottom:10,paddingTop:5,gap:8},inputWrap:{ ...inputStyles.container, flex:1, flexDirection:'row', alignItems:'flex-end' },input:{ ...inputStyles.text, flex:1, maxHeight:120, lineHeight:25 },mic:{width:36,height:44,alignItems:'center',justifyContent:'center'},send:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},greeting:{alignItems:'center',gap:14,paddingVertical:45},voice:{flexDirection:'row',alignItems:'center',gap:8},voicePlay:{padding:4},wave:{flexDirection:'row',gap:2,alignItems:'center',height:32},sheetBackdrop:{flex:1,backgroundColor:'#121B2655'},sheet:{backgroundColor:colors.white,borderTopLeftRadius:28,borderTopRightRadius:28,padding:24,paddingBottom:40,gap:8},sheetHandle:{alignSelf:'center',width:36,height:4,borderRadius:2,backgroundColor:'#DDE3D5',marginBottom:18},error:{fontSize:13,lineHeight:21,color:colors.error},contactCopy:{flex:1,minWidth:0,gap:2},richBubble:{backgroundColor:'transparent',paddingHorizontal:0,paddingVertical:0,borderRadius:20},callButton:{width:42,height:42,borderRadius:21,backgroundColor:colors.input,alignItems:'center',justifyContent:'center'},});
