import { inputStyles } from '../../constants/inputStyles';
import {UploadCard} from '../../components/UploadCard';
import {KeyboardAwareScrollView as ScrollView} from '../../components/KeyboardAwareScrollView';
import {LocalizedTextInput as TextInput} from '../../components/LocalizedNative';
import {AppText as Text} from '../../components/AppText';
import { useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {Image, StyleSheet, View} from 'react-native';
import { MessagingIcon as Ionicons } from '../../components/MessagingIcon';
import { colors } from '../../constants/colors';
import { ActionButton } from '../../components/ActionButton';
import { RideMap } from '../../components/maps/RideMap';
import { useMessaging } from '../../contexts/MessagingContext';
import type { RootStackParamList } from '../../navigation/types';
import { EmptyState, MessagingFrame, TripCard, ui } from './MessagingUI';

export function AttachmentReviewScreen() {
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();const {params}=useRoute<RouteProp<RootStackParamList,'AttachmentReview'>>();const {conversations,send}=useMessaging();const person=conversations.find(item=>item.id===params.conversationId);const [caption,setCaption]=useState('');const [saved,setSaved]=useState(false);const saving=useRef(false);
  function add(){if(saving.current||!person)return;saving.current=true;setSaved(true);send(person.id,{kind:params.kind,text:caption|| (params.kind==='trip'?'Your ride details':''),uri:params.uri,coordinate:params.coordinate,label:params.label});navigation.goBack();}
  return <MessagingFrame title={params.kind==='image'?'Review Photo':params.kind==='location'?'Share Location':'Share Trip Details'}><ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">{!person?<EmptyState title="Conversation unavailable" body="Return to your conversation before adding an attachment." />:<><Text style={ui.body}>Add to your conversation with {person.name}.</Text>{params.kind==='image'?<UploadCard title="Photo" description="Review your attachment before adding it." uri={params.uri} onRemove={()=>navigation.goBack()}/>:params.kind==='location'&&params.coordinate?<><View style={s.map}><RideMap pickup={params.coordinate} cameraCoordinates={[params.coordinate]} bottomInset={0} topInset={0} interactive={false} showControls={false} /></View><View style={ui.card}><Text translate style={ui.medium}>Your current location</Text><Text translate style={ui.body}>{params.coordinate.latitude.toFixed(5)}, {params.coordinate.longitude.toFixed(5)}</Text><Text translate style={ui.small}>This shares a single location, not live tracking.</Text></View></>:person.trip?<TripCard trip={person.trip} />:null}<TextInput accessibilityLabel="Attachment caption" placeholder="Add a caption (optional)" value={caption} onChangeText={setCaption} multiline maxLength={500} style={s.caption} /><ActionButton accessibilityLabel="Add attachment to conversation" disabled={saved||params.kind==='image'&&!params.uri||params.kind==='location'&&!params.coordinate} onPress={add}>Add to conversation</ActionButton></>}</ScrollView></MessagingFrame>;
}
export function MessageMediaScreen() {
  const {params}=useRoute<RouteProp<RootStackParamList,'MessageMedia'>>();const {conversations}=useMessaging();const person=conversations.find(item=>item.id===params.conversationId);const message=person?.messages.find(item=>item.id===params.messageId);
  return <MessagingFrame title={message?.kind==='location'?'Shared Location':message?.kind==='trip'?'Trip Details':'Shared Photo'}><ScrollView contentContainerStyle={ui.content}>{!message?<EmptyState title="Attachment unavailable" body="This attachment is no longer available in the current session." />:message.kind==='image'?<><Image source={{uri:message.uri}} resizeMode="contain" style={s.largeImage} />{!!message.text&&<Text style={ui.body}>{message.text}</Text>}</>:message.kind==='location'&&message.coordinate?<><View style={s.map}><RideMap pickup={message.coordinate} cameraCoordinates={[message.coordinate]} bottomInset={0} topInset={0} interactive={false} showControls={false} /></View><Text style={ui.heading}>{message.label||'Shared location'}</Text><Text translate style={ui.body}>{message.coordinate.latitude.toFixed(5)}, {message.coordinate.longitude.toFixed(5)}</Text><Text translate style={ui.small}>A location shared at one moment, not live tracking.</Text></>:person?.trip?<TripCard trip={person.trip} />:<Text style={ui.body}>{message.text}</Text>}</ScrollView></MessagingFrame>;
}
const s=StyleSheet.create({image:{width:'100%',height:320,borderRadius:20,backgroundColor:'#F5F7F1'},largeImage:{width:'100%',height:480,borderRadius:18,backgroundColor:'#F5F7F1'},map:{height:300,borderRadius:20,overflow:'hidden',position:'relative'},caption:{ ...inputStyles.field, minHeight:80, textAlignVertical:'top' }});
