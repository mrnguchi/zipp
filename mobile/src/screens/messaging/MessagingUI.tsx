import type { ComponentProps, PropsWithChildren } from 'react';
import { MessagingIcon as Ionicons } from '../../components/MessagingIcon';
import { useNavigation } from '@react-navigation/native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import type { Conversation, TripDetails } from '../../services/messaging';

export function Avatar({ conversation, size = 52 }: { conversation: Pick<Conversation, 'initials' | 'role'>; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: conversation.role === 'Support' ? colors.primary : colors.iconBackground, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: size * 0.3, fontWeight: '700', color: conversation.role === 'Support' ? colors.white : colors.primaryDark }}>{conversation.initials}</Text></View>;
}
export function IconButton({ icon, label, onPress, disabled = false, yellow = false }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean; yellow?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed}) => [ui.iconButton, yellow && {backgroundColor:colors.yellow+'26'}, (pressed||disabled)&&{opacity:0.45}]}><Ionicons name={icon} size={23} color={colors.primaryDark} /></Pressable>;
}
export function MessagingFrame({ title, children, right }: PropsWithChildren<{title:string;right?:React.ReactNode}>) {
  const navigation=useNavigation();
  return <SafeAreaView style={ui.screen} edges={['top','left','right','bottom']}><View style={ui.header}><IconButton icon="chevron-back" label="Back" onPress={() => navigation.goBack()} /><Text style={ui.headerTitle}>{title}</Text><View style={ui.headerRight}>{right}</View></View>{children}</SafeAreaView>;
}
export function TripCard({ trip, onPress, inChat = false }: {trip:TripDetails;onPress?:()=>void;inChat?:boolean}) {
  const content=<>
    <View style={ui.tripTop}>
      <Image source={require('../../../assets/chat-trip-car.png')} resizeMode="contain" style={ui.tripCarImage} accessible={false} />
      <View style={ui.flex}><Text style={ui.tripTitle}>Your Zipp ride</Text><Text style={ui.tripSubtitle}>{trip.vehicle}</Text><Text style={ui.plateText}>{trip.plate}</Text></View>
    </View>
    <View style={ui.tripRoute}>
      <View style={ui.tripStop}><Ionicons name="radio-button-on" size={15} color={colors.primary} /><Text style={[ui.tripLocation,ui.flex]}>{trip.pickup}</Text></View>
      <View style={ui.tripStop}><Ionicons name="location" size={17} color={colors.primary} /><Text style={[ui.tripLocation,ui.flex]}>{trip.destination}</Text></View>
    </View>
  </>;
  return onPress?<Pressable accessibilityRole="button" accessibilityLabel="View trip details" onPress={onPress} style={({pressed})=>[ui.tripCard,inChat&&ui.chatTripCard,pressed&&{opacity:0.7}]}>{content}</Pressable>:<View style={[ui.tripCard,inChat&&ui.chatTripCard]}>{content}</View>;
}
export function EmptyState({title,body,icon='chatbubbles-outline'}:{title:string;body:string;icon?:ComponentProps<typeof Ionicons>['name']}) {
  return <View style={ui.empty}><View style={ui.emptyIcon}><Ionicons name={icon} size={32} color={colors.primary} /></View><Text style={ui.emptyTitle}>{title}</Text><Text style={[ui.body,{textAlign:'center'}]}>{body}</Text></View>;
}
export function timeLabel(time:number) { return new Intl.DateTimeFormat('en-GB',{hour:'numeric',minute:'2-digit'}).format(new Date(time)); }
export function dateLabel(time:number) { const now=new Date();const date=new Date(time);return date.toDateString()===now.toDateString()?'Today':new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(date); }

export const ui=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#FFFFFF'},flex:{flex:1},header:{height:72,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#F0F1EE'},headerTitle:{flex:1,fontSize:19,fontWeight:'600',color:colors.navy,textAlign:'center'},headerRight:{width:44,alignItems:'center'},iconButton:{width:44,height:44,borderRadius:22,backgroundColor:colors.iconBackground,alignItems:'center',justifyContent:'center'},
  content:{padding:20,gap:22,paddingBottom:36},body:{fontSize:14,lineHeight:22,color:'#6F776E'},small:{fontSize:12,lineHeight:19,color:'#92998D'},medium:{fontSize:15,lineHeight:23,fontWeight:'600',color:colors.navy},heading:{fontSize:24,fontWeight:'700',color:colors.navy},label:{fontSize:13,fontWeight:'600',color:colors.primaryDark},
  search:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:colors.iconBackground,borderRadius:15,paddingHorizontal:14,minHeight:48},searchInput:{flex:1,fontSize:15,color:colors.navy,paddingVertical:12},notice:{flexDirection:'row',alignItems:'center',gap:8,padding:12,backgroundColor:colors.yellow+'1B',borderRadius:12},noticeText:{flex:1,fontSize:12,lineHeight:19,color:'#797451'},
  row:{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:18},rowCopy:{flex:1,gap:4},rowTitle:{fontSize:16,fontWeight:'600',color:colors.navy},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#EEF1EB'},card:{borderRadius:18,backgroundColor:colors.iconBackground,padding:18,gap:14},tripCard:{backgroundColor:'#F4F4F4',padding:16,borderRadius:20,gap:12,borderWidth:StyleSheet.hairlineWidth,borderColor:'#E5E5E5'},
  // Match the photo content width. Flex-only text rows have no intrinsic width
  // inside a shrink-wrapped chat bubble and can otherwise collapse to a column.
  chatTripCard:{width:224,padding:12,borderRadius:16,borderWidth:0},
  tripTitle:{fontSize:17,lineHeight:25,fontWeight:'600',color:colors.navy},tripSubtitle:{fontSize:14,lineHeight:21,color:'#858585'},tripLocation:{fontSize:16,lineHeight:24,color:'#454B43'},tripTop:{flexDirection:'row',alignItems:'center',gap:11},tripCarImage:{width:30,height:30},
  plateText:{fontSize:12,lineHeight:18,fontWeight:'500',letterSpacing:0.5,color:'#687063'},
  tripRoute:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#DFDFDF',paddingTop:12,gap:12},tripStop:{flexDirection:'row',alignItems:'center',gap:9},
  empty:{flex:1,justifyContent:'center',alignItems:'center',gap:14,padding:36,minHeight:250},emptyIcon:{width:74,height:74,borderRadius:28,backgroundColor:colors.iconBackground,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:20,fontWeight:'600',color:colors.navy,textAlign:'center'},
});
