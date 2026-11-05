import {useRef,useState} from 'react';
import {ActivityIndicator,Animated,Image,ScrollView,StyleSheet,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Ionicons} from '@expo/vector-icons';
import {StatusBar} from 'expo-status-bar';
import {AppText as Text} from '../../components/AppText';
import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import {ActionButton} from '../../components/ActionButton';
import {DriverRequestCard} from '../../components/DriverRequestCard';
import {RideMap} from '../../components/maps/RideMap';
import {useDriverWorkspace} from '../../contexts/DriverWorkspaceContext';
import {useHomeSheet} from '../../hooks/useHomeSheet';
import {useRoadRoute} from '../../hooks/useRoadRoute';
import {useMyLocation} from '../../hooks/useMyLocation';
import {colors} from '../../constants/colors';
import type {RootStackParamList} from '../../navigation/types';

const pickup={latitude:4.155,longitude:9.24},destination={latitude:4.145,longitude:9.28};
export function DriverOfferScreen(){
 const nav=useNavigation<NativeStackNavigationProp<RootStackParamList>>(),{state,dispatch}=useDriverWorkspace(),insets=useSafeAreaInsets(),{height}=useWindowDimensions();
 const [screenHeight,setScreenHeight]=useState(height);const sheet=useHomeSheet(screenHeight,insets.top+72,.66);
 const {locate,locating,locationFocus}=useMyLocation();
 const job=state.job,available=state.enabled&&state.online&&job?.phase==='offer';
 const road=useRoadRoute(available?pickup:undefined,available?destination:undefined);
 const approach=useRoadRoute(available?locationFocus?.coordinate:undefined,available?pickup:undefined);
 const handled=useRef(false);
 const footerHeight=142+Math.max(insets.bottom,16);
 function accept(){if(!available||handled.current)return;handled.current=true;dispatch({type:'accept'});nav.replace('DriverJob');}
 function decline(){if(!available||handled.current)return;handled.current=true;dispatch({type:'cancel',reason:'Declined request',now:Date.now()});nav.goBack();}
 return <View style={s.screen} onLayout={event=>setScreenHeight(event.nativeEvent.layout.height)}>
  <StatusBar style="dark"/>
  <RideMap pickup={available?pickup:undefined} destination={available?destination:undefined} route={road.route?.coordinates} cameraCoordinates={road.route?.coordinates} topInset={insets.top+80} bottomInset={0} cameraBottomInset={sheet.expanded?sheet.expandedHeight:sheet.collapsedHeight} attributionBottomInset={sheet.expandedHeight} overlayTranslateY={sheet.translateY} locationFocus={locationFocus} showControls={false}/>
  <View style={[s.header,{top:insets.top+10}]}><Pressable accessibilityRole="button" accessibilityLabel="Back to driver home" onPress={()=>nav.goBack()} style={s.circle}><Ionicons name="arrow-back" size={23} color={colors.navy}/></Pressable><View style={s.headerTitle}><Text translate style={s.headerText}>New request</Text></View><Pressable accessibilityRole="button" accessibilityLabel="My location" disabled={locating} onPress={()=>{void locate();}} style={s.circle}>{locating?<ActivityIndicator color={colors.primary}/>:<Image source={require('../../../assets/current-location.png')} resizeMode="contain" style={s.location}/>}</Pressable></View>
  <Animated.View style={[s.sheet,{height:sheet.expandedHeight,transform:[{translateY:sheet.translateY}]}]}>
   <View {...sheet.panHandlers}><Pressable accessibilityRole="button" accessibilityLabel={sheet.expanded?'Collapse request details':'Expand request details'} accessibilityState={{expanded:sheet.expanded}} onPress={()=>sheet.snap(!sheet.expanded)} style={s.handleArea}><View style={s.handle}/></Pressable></View>
   <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.body,{paddingBottom:footerHeight+(sheet.expanded?0:sheet.travel)}]}>
    {available&&job?<>
     <View style={s.sectionHeader}><View style={s.flex}><Text translate style={s.title}>{job.kind==='ride'?'A new ride for you':'A new delivery for you'}</Text><Text translate style={s.copy}>Review the details before accepting.</Text></View></View>
     {road.route&&<View style={s.estimates}><View style={s.estimate}><Ionicons name="navigate-outline" size={17} color={colors.primary}/><Text style={s.estimateValue}>{(road.route.distanceMeters/1000).toFixed(1)} km</Text><Text translate style={s.label}>Trip distance</Text></View><View style={s.estimate}><Ionicons name="time-outline" size={17} color={colors.primary}/><Text style={s.estimateValue}>{Math.max(1,Math.round(road.route.durationSeconds/60))} min</Text><Text translate style={s.label}>Estimated trip</Text></View></View>}
     {road.status==='error'&&<Pressable accessibilityRole="button" accessibilityLabel="Retry request route" onPress={road.retry}><Text translate style={s.link}>Could not load the route. Tap to retry.</Text></Pressable>}
     {approach.route&&<Text style={s.copy}>{(approach.route.distanceMeters/1000).toFixed(1)} km · {Math.max(1,Math.round(approach.route.durationSeconds/60))} min to pickup</Text>}
     <DriverRequestCard job={job}/>
     <View style={s.customer}><View style={s.avatar}><Text style={s.initials}>{job.customer.split(' ').map(value=>value[0]).join('').slice(0,2)}</Text></View><View style={s.flex}><Text style={s.name}>{job.customer}</Text><Text translate style={s.copy}>{job.kind==='ride'?'Your rider':'Package contact'}</Text></View><Image source={require('../../../assets/wallet.png')} resizeMode="contain" style={s.wallet}/></View>
     <View style={s.payment}><Text translate style={s.copy}>Payment method</Text><Text style={s.value}>Zipp Wallet</Text></View><View style={s.payment}><Text translate style={s.copy}>Service fee</Text><Text style={s.value}>{Math.round(job.fee).toLocaleString('en-GB')} XAF</Text></View>
     {job.package&&<View style={s.customer}><Image source={require('../../../assets/delivery-bike.png')} resizeMode="contain" style={s.wallet}/><Text style={s.name}>{job.package}</Text></View>}
    </>:<View style={s.empty}><Ionicons name="time-outline" size={36} color={colors.primary}/><Text translate style={s.title}>Request unavailable</Text><Text translate style={s.copy}>Return home to see your current requests.</Text></View>}
   </ScrollView>
  </Animated.View>
  <View style={[s.footer,{paddingBottom:Math.max(insets.bottom,16)}]}>{available?<><ActionButton accessibilityLabel="Accept driver request" onPress={accept}>{job?.kind==='ride'?'Accept ride':'Accept delivery'}</ActionButton><Pressable accessibilityRole="button" accessibilityLabel="Decline driver request" onPress={decline} style={s.decline}><Ionicons name="close" size={19} color={colors.secondaryText}/><Text translate style={s.declineText}>Decline request</Text></Pressable></>:<ActionButton accessibilityLabel="Return to driver home" onPress={()=>nav.goBack()}>Back to home</ActionButton>}</View>
 </View>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:colors.white},header:{position:'absolute',left:24,right:24,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},circle:{width:44,height:44,borderRadius:22,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},headerTitle:{backgroundColor:colors.white,paddingHorizontal:20,paddingVertical:12,borderRadius:25},headerText:{fontSize:16,fontWeight:'600',color:colors.navy},location:{width:23,height:23},sheet:{position:'absolute',left:0,right:0,bottom:0,borderTopLeftRadius:32,borderTopRightRadius:32,backgroundColor:colors.white},handleArea:{height:34,alignItems:'center',justifyContent:'center'},handle:{width:36,height:4,borderRadius:2,backgroundColor:colors.border},body:{paddingHorizontal:24,gap:16},sectionHeader:{flexDirection:'row',alignItems:'center',gap:12},flex:{flex:1,gap:4},title:{fontSize:21,lineHeight:30,fontWeight:'600',color:colors.navy},copy:{fontSize:12,lineHeight:20,color:colors.secondaryText},estimates:{flexDirection:'row',gap:12},estimate:{flex:1,flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:6,padding:13,backgroundColor:colors.input,borderRadius:16},estimateValue:{fontSize:14,fontWeight:'600',color:colors.navy},label:{width:'100%',fontSize:10,lineHeight:17,color:colors.secondaryText},link:{fontSize:12,lineHeight:20,fontWeight:'500',color:colors.primary},customer:{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderRadius:18,backgroundColor:colors.input},avatar:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.white},initials:{fontSize:14,fontWeight:'600',color:colors.primary},name:{fontSize:14,fontWeight:'600',color:colors.navy},wallet:{width:30,height:30},payment:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingHorizontal:4},value:{fontSize:12,fontWeight:'600',color:colors.navy},footer:{position:'absolute',left:0,right:0,bottom:0,paddingTop:14,paddingHorizontal:24,gap:6,backgroundColor:colors.white,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},decline:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,minHeight:44},declineText:{fontSize:14,fontWeight:'600',color:colors.secondaryText},empty:{alignItems:'center',padding:24,gap:15}});
