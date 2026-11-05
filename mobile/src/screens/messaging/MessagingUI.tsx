import { inputStyles } from '../../constants/inputStyles';
import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import {AppText as Text} from '../../components/AppText';
import type { ComponentProps, PropsWithChildren } from 'react';
import { MessagingIcon as Ionicons } from '../../components/MessagingIcon';
import { useNavigation } from '@react-navigation/native';
import {Image, StyleSheet, View, KeyboardAvoidingView, Platform, useWindowDimensions} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import type { Conversation, TripDetails } from '../../services/messaging';
import type { MapCoordinate } from '../../components/maps/mapGeometry';

export function Avatar({ conversation, size = 52 }: { conversation: Pick<Conversation, 'initials' | 'role'>; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: conversation.role === 'Support' ? colors.primary : colors.iconBackground, alignItems: 'center', justifyContent: 'center' }}><Text translate style={{ fontSize: size * 0.3, fontWeight: '700', color: conversation.role === 'Support' ? colors.white : colors.primaryDark }}>{conversation.initials}</Text></View>;
}
export function IconButton({ icon, label, onPress, disabled = false, yellow = false }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean; yellow?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed}) => [ui.iconButton, yellow && {backgroundColor:colors.yellow+'26'}, (pressed||disabled)&&{opacity:0.45}]}><Ionicons name={icon} size={23} color={colors.primaryDark} /></Pressable>;
}
export function MessageBackButton({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} style={({pressed})=>[ui.backButton,pressed&&{opacity:0.65}]}><Ionicons name="arrow-back" size={22} color={colors.navy}/></Pressable>;
}
export function MessagingFrame({ title, children, right }: PropsWithChildren<{title:string;right?:React.ReactNode}>) {
  const navigation=useNavigation();
  return <SafeAreaView style={ui.screen} edges={['top','left','right','bottom']}><View style={ui.header}><MessageBackButton onPress={() => navigation.goBack()} /><Text translate style={ui.headerTitle}>{title}</Text><View style={ui.headerRight}>{right}</View></View><KeyboardAvoidingView style={ui.flex} behavior={Platform.OS==='ios'?'padding':'height'}>{children}</KeyboardAvoidingView></SafeAreaView>;
}
export function TripCard({ trip, onPress, inChat = false }: {trip:TripDetails;onPress?:()=>void;inChat?:boolean}) {
  const {width}=useWindowDimensions();
  const chatWidth=inChat?{width:Math.min(280,width-104)}:undefined;
  const content=<>
    <View style={ui.tripTop}>
      <View style={ui.vehicleTile}><Image source={require('../../../assets/driver car.png')} resizeMode="contain" style={ui.tripCarImage} accessible={false} /></View>
      <View style={ui.flex}><Text translate style={ui.tripTitle}>Your Zipp ride</Text><Text style={ui.tripSubtitle}>{trip.vehicle}</Text><View style={ui.plate}><Text style={ui.plateText}>{trip.plate}</Text></View></View>
    </View>
    <View style={ui.tripRoute}>
      <View style={ui.tripStop}><View style={ui.pickupDot}/><View style={ui.flex}><Text translate style={ui.stopLabel}>Pickup</Text><Text style={ui.tripLocation}>{trip.pickup}</Text></View></View>
      <View style={ui.tripStop}><Image source={require('../../../assets/location.png')} resizeMode="contain" style={ui.stopAsset}/><View style={ui.flex}><Text translate style={ui.stopLabel}>Destination</Text><Text style={ui.tripLocation}>{trip.destination}</Text></View></View>
    </View>
  </>;
  return onPress?<Pressable accessibilityRole="button" accessibilityLabel="View trip details" onPress={onPress} style={({pressed})=>[ui.tripCard,inChat&&ui.chatTripCard,chatWidth,pressed&&{opacity:0.7}]}>{content}</Pressable>:<View style={[ui.tripCard,inChat&&ui.chatTripCard,chatWidth]}>{content}</View>;
}
export function SharedLocationCard({label,coordinate,mine=false}:{label?:string;coordinate?:MapCoordinate;mine?:boolean}) {
  const {width}=useWindowDimensions();
  return <View style={[ui.locationCard,{width:Math.min(280,width-104)},mine&&{backgroundColor:colors.primary,borderBottomRightRadius:7}]}>
    <View style={ui.tripTop}><View style={[ui.vehicleTile,mine&&{backgroundColor:colors.yellow}]}><Image source={require('../../../assets/location.png')} resizeMode="contain" style={ui.locationAsset}/></View><View style={ui.flex}><Text translate style={[ui.stopLabel,mine&&{color:colors.yellow}]}>Shared location</Text><Text translate style={[ui.tripTitle,mine&&{color:colors.white}]}>{label||'Shared location'}</Text></View></View>
    {coordinate&&<Text style={[ui.tripSubtitle,mine&&{color:'#FFFFFFD9'}]}>{coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}</Text>}
    <View style={[ui.locationFooter,mine&&{borderTopColor:'#FFFFFF33'}]}><Text translate style={[ui.locationLink,mine&&{color:colors.white}]}>View on map</Text><View style={[ui.locationArrow,mine&&{backgroundColor:colors.yellow}]}><Ionicons name="chevron-forward" size={18} color={mine?colors.navy:colors.primary}/></View></View>
  </View>;
}
export function EmptyState({title,body,icon='chatbubbles-outline'}:{title:string;body:string;icon?:ComponentProps<typeof Ionicons>['name']}) {
  return <View style={ui.empty}><View style={ui.emptyIcon}><Ionicons name={icon} size={32} color={colors.primary} /></View><Text translate style={ui.emptyTitle}>{title}</Text><Text translate style={[ui.body,{textAlign:'center'}]}>{body}</Text></View>;
}
export function timeLabel(time:number) { return new Intl.DateTimeFormat('en-GB',{hour:'numeric',minute:'2-digit'}).format(new Date(time)); }
export function dateLabel(time:number) { const now=new Date();const date=new Date(time);return date.toDateString()===now.toDateString()?'Today':new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(date); }

export const ui=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#FFFFFF'},flex:{flex:1},header:{height:72,paddingHorizontal:18,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#F0F1EE'},headerTitle:{flex:1,fontSize:19,fontWeight:'600',color:colors.navy,textAlign:'center'},headerRight:{width:44,alignItems:'center'},iconButton:{width:44,height:44,borderRadius:22,backgroundColor:colors.iconBackground,alignItems:'center',justifyContent:'center'},
  content:{padding:20,gap:22,paddingBottom:36},body:{fontSize:14,lineHeight:22,color:'#6F776E'},small:{fontSize:12,lineHeight:19,color:'#92998D'},medium:{fontSize:15,lineHeight:23,fontWeight:'600',color:colors.navy},heading:{fontSize:24,fontWeight:'700',color:colors.navy},label:{fontSize:13,fontWeight:'600',color:colors.primaryDark},
  search:{ ...inputStyles.container, flexDirection:'row', alignItems:'center', gap:10 },searchInput:{ ...inputStyles.text, flex:1 },notice:{flexDirection:'row',alignItems:'center',gap:8,padding:12,backgroundColor:colors.yellow+'1B',borderRadius:12},noticeText:{flex:1,fontSize:12,lineHeight:19,color:'#797451'},
  row:{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:18},rowCopy:{flex:1,gap:4},rowTitle:{fontSize:16,fontWeight:'600',color:colors.navy},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#EEF1EB'},card:{borderRadius:18,backgroundColor:colors.iconBackground,padding:18,gap:14},tripCard:{backgroundColor:colors.input,padding:16,borderRadius:20,gap:16,borderWidth:0},
  // Match the photo content width. Flex-only text rows have no intrinsic width
  // inside a shrink-wrapped chat bubble and can otherwise collapse to a column.
  chatTripCard:{padding:16,borderRadius:20,borderWidth:0},
  tripTitle:{fontSize:15,lineHeight:22,fontWeight:'600',color:colors.navy},tripSubtitle:{fontSize:11,lineHeight:18,color:colors.secondaryText},tripLocation:{fontSize:12,lineHeight:19,fontWeight:'500',color:colors.navy},tripTop:{flexDirection:'row',alignItems:'center',gap:11},tripCarImage:{width:38,height:38},
  plateText:{fontSize:10,lineHeight:16,fontWeight:'600',letterSpacing:0.8,color:colors.navy},
  tripRoute:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,paddingTop:14,gap:14},tripStop:{flexDirection:'row',alignItems:'center',gap:10},
  empty:{flex:1,justifyContent:'center',alignItems:'center',gap:14,padding:36,minHeight:250},emptyIcon:{width:74,height:74,borderRadius:28,backgroundColor:colors.iconBackground,alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:20,fontWeight:'600',color:colors.navy,textAlign:'center'},
backButton:{width:42,height:42,borderRadius:21,backgroundColor:colors.input,alignItems:'center',justifyContent:'center'},vehicleTile:{width:50,height:50,borderRadius:16,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},plate:{alignSelf:'flex-start',paddingHorizontal:7,paddingVertical:2,borderRadius:6,backgroundColor:colors.white,marginTop:5},stopLabel:{fontSize:10,lineHeight:16,fontWeight:'500',color:colors.secondaryText},stopAsset:{width:20,height:22},pickupDot:{width:12,height:12,borderRadius:6,borderWidth:3,borderColor:colors.primary,marginHorizontal:4},locationCard:{backgroundColor:colors.input,padding:16,borderRadius:20,gap:14},locationAsset:{width:30,height:30},locationFooter:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,paddingTop:12},locationLink:{fontSize:12,fontWeight:'600',color:colors.primary},locationArrow:{width:30,height:30,borderRadius:15,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},});
