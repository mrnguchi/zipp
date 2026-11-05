import {useEffect,useRef,useState} from 'react';
import type {ComponentRef} from 'react';
import {AccessibilityInfo,ActivityIndicator,Animated,Image,Modal,ScrollView,StyleSheet,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Ionicons} from '@expo/vector-icons';
import {StatusBar} from 'expo-status-bar';
import {AppText as Text} from '../../components/AppText';
import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import {ActionButton} from '../../components/ActionButton';
import {ArrivalDots} from '../../components/ArrivalDots';
import {DriverRequestCard} from '../../components/DriverRequestCard';
import {RideMap} from '../../components/maps/RideMap';
import {NotificationList} from '../../components/NotificationList';
import {useDriverWorkspace} from '../../contexts/DriverWorkspaceContext';
import {useDriverOnboarding} from '../../contexts/DriverOnboardingContext';
import {useNotificationAudio} from '../../contexts/NotificationAudioContext';
import {useProfileSettings} from '../../contexts/ProfileSettingsContext';
import {useRole} from '../../contexts/RoleContext';
import {profileDisplayName,useProfile} from '../../contexts/ProfileContext';
import {useHomeSheet} from '../../hooks/useHomeSheet';
import {useMyLocation} from '../../hooks/useMyLocation';
import {useRoadRoute} from '../../hooks/useRoadRoute';
import {activeDriverJob,driverBalance} from '../../services/driverWorkspace';
import {suggestedVehicleCategory} from '../../services/driverOnboarding';
import {colors} from '../../constants/colors';
import type {RootStackParamList} from '../../navigation/types';
const pickup={latitude:4.155,longitude:9.24},destination={latitude:4.145,longitude:9.28};
export function DriverMapHome({bottomInset}:{bottomInset:number}){
 const nav=useNavigation<NativeStackNavigationProp<RootStackParamList>>(),insets=useSafeAreaInsets(),{height}=useWindowDimensions();
 const [screenHeight,setScreenHeight]=useState(height),[notices,setNotices]=useState(false);
 const sheet=useHomeSheet(screenHeight,insets.top,.48),{locating,locationFocus,locate}=useMyLocation();
 const {state,dispatch}=useDriverWorkspace(),{application}=useDriverOnboarding(),{profile}=useProfile();
 const playAudio=useNotificationAudio(),{sounds}=useProfileSettings();
 const {selectRole}=useRole();
 const onlineScale=useRef(new Animated.Value(1)).current,goingOnline=useRef(false),reduceMotion=useRef(false);
 useEffect(()=>{let mounted=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(mounted)reduceMotion.current=value;});const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{reduceMotion.current=value;});return()=>{mounted=false;subscription.remove();onlineScale.stopAnimation();};},[onlineScale]);
 function goOnline(){
  if(goingOnline.current||state.online||!state.enabled)return;
  goingOnline.current=true;
  if(sounds.info!=='silent')void playAudio('chime').catch(()=>{});
  const finish=()=>{dispatch({type:'online',value:true});goingOnline.current=false;};
  if(reduceMotion.current){finish();return;}
  Animated.sequence([Animated.timing(onlineScale,{toValue:.97,duration:100,useNativeDriver:true}),Animated.spring(onlineScale,{toValue:1,friction:4,tension:180,useNativeDriver:true})]).start(({finished})=>{if(finished)finish();});
 }
 const working=activeDriverJob(state.job),isBike=(state.enabled?state.kind:application.kind)==='bike';
 const incoming=state.online&&state.job?.phase==='offer'?state.job:undefined;
 const scroll=useRef<ComponentRef<typeof ScrollView>>(null),handledOffer=useRef<string|null>(null);
 useEffect(()=>{if(incoming){sheet.snap(true);scroll.current?.scrollTo({y:0,animated:true});}},[incoming?.id]);
 const road=useRoadRoute(working?pickup:undefined,working?destination:undefined);
 const name=profileDisplayName(profile)||'Suh',completed=state.history.filter(j=>j.phase==='completed').length;
 const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'Africa/Douala'}).format(new Date()));
 function accept(){if(!incoming||handledOffer.current===incoming.id)return;handledOffer.current=incoming.id;dispatch({type:'accept'});nav.navigate('DriverJob');}
 function decline(){if(!incoming||handledOffer.current===incoming.id)return;handledOffer.current=incoming.id;dispatch({type:'cancel',reason:'Declined request',now:Date.now()});}
 return <View style={h.screen} onLayout={e=>{if(e.nativeEvent.layout.height>0)setScreenHeight(e.nativeEvent.layout.height);}}>
  <StatusBar style="dark"/>
  <RideMap bottomInset={0} attributionBottomInset={sheet.expandedHeight} overlayTranslateY={sheet.translateY} cameraBottomInset={sheet.expanded?sheet.expandedHeight:sheet.collapsedHeight} topInset={insets.top+160} showControls={false} locationFocus={locationFocus} pickup={working?pickup:undefined} destination={working?destination:undefined} route={road.route?.coordinates}/>
  <View pointerEvents="box-none" style={[h.top,{paddingTop:insets.top+12}]}><View pointerEvents="none" style={h.headerBackground}/><View style={h.row}><View style={h.flex}><Text translate style={h.greeting}>{hour<12?'Good morning,':hour<18?'Good afternoon,':'Good evening,'}</Text><Text style={h.name} numberOfLines={1}>{name} 👋</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={()=>setNotices(true)} style={h.round}><Ionicons name="notifications" size={26} color={colors.navy}/></Pressable></View></View>
  <Animated.View pointerEvents={sheet.expanded?'none':'box-none'} style={[h.mapActions,{bottom:sheet.expandedHeight+24,transform:[{translateY:sheet.translateY}],opacity:sheet.translateY.interpolate({inputRange:[0,Math.max(1,sheet.travel*.7),Math.max(2,sheet.travel)],outputRange:[0,0,1],extrapolate:'clamp'})}]}><Pressable accessibilityRole="button" accessibilityLabel="My location" accessibilityState={{busy:locating,disabled:locating}} disabled={locating} onPress={()=>void locate()} style={h.round}>{locating?<ActivityIndicator color={colors.primaryDark}/>:<Image source={require('../../../assets/current-location.png')} resizeMode="contain" style={{width:25,height:25}}/>}</Pressable></Animated.View>
  <Animated.View style={[h.sheet,{height:sheet.expandedHeight,transform:[{translateY:sheet.translateY}]}]}><View {...sheet.panHandlers}><Pressable accessibilityRole="button" accessibilityLabel={sheet.expanded?'Collapse driver sheet':'Expand driver sheet'} accessibilityState={{expanded:sheet.expanded}} onPress={()=>sheet.snap(!sheet.expanded)} style={h.handleArea}><View style={h.handle}/></Pressable></View>
   <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={[h.body,{paddingBottom:bottomInset+(sheet.expanded?0:sheet.travel)}]}>
    <View style={h.statusCard}><View style={h.statusIcon}>{working?<Ionicons name="navigate" size={28} color={colors.primary}/>:<Image source={require('../../../assets/power-on.png')} resizeMode="contain" style={h.powerIcon}/>}</View><View style={h.flex}><View style={h.statusHeading}><View style={[h.statusDot,{backgroundColor:state.online?colors.primary:'#A5ADB5'}]}/><Text translate style={h.statusTitle}>{!state.enabled?'Ready to drive?':working?'Your trip is in progress':state.online?'You’re online':'You’re offline'}</Text></View>{state.online&&!working&&!incoming?<><View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap'}}><Text translate style={h.small}>Looking for ride requests</Text><ArrivalDots/></View><Text translate style={h.small}>New requests will appear here.</Text></>:<Text translate style={h.small}>{!state.enabled?'Complete verification to start your first trip.':working?'Return to your current pickup or delivery.':incoming?'Review the pickup, destination and fare.':'Go online when you’re ready.'}</Text>}</View></View>
    {(!state.enabled||!state.online||working)&&<Animated.View style={{transform:[{scale:onlineScale}]}}><ActionButton accessibilityLabel={!state.enabled?'View driver verification':working?'Resume current trip':'Go online'} onPress={()=>!state.enabled?nav.navigate('DriverVerificationStatus'):working?nav.navigate('DriverJob'):goOnline()}>{!state.enabled?'Finish verification':working?'Resume trip':'Go online'}</ActionButton></Animated.View>}
    {incoming&&<DriverRequestCard job={incoming} compact onReview={()=>nav.navigate('DriverOffer')} onAccept={accept} onDecline={decline}/>}
    {state.online&&!working&&<Pressable accessibilityRole="button" accessibilityLabel="Go offline" onPress={()=>dispatch({type:'online',value:false})} style={{alignSelf:'center',flexDirection:'row',gap:8,alignItems:'center',minHeight:44,paddingHorizontal:18,borderRadius:22,backgroundColor:colors.input}}><Ionicons name="power-outline" size={17} color={colors.secondaryText}/><Text translate style={{fontSize:13,fontWeight:'600',color:colors.secondaryText}}>Go offline</Text></Pressable>}
    <View style={h.row}><Pressable accessibilityRole="button" accessibilityLabel="View driver earnings" onPress={()=>nav.navigate('RoleHome',{driverTab:'Earnings'})} style={h.summary}><View style={h.between}><Text translate style={h.caption}>Earning</Text><Ionicons name="chevron-forward" size={16} color={colors.primary}/></View><View style={h.amountRow}><Text style={h.amount} numberOfLines={1} adjustsFontSizeToFit>{Math.round(driverBalance(state)).toLocaleString('en-GB')}</Text><Text style={h.currency}>XAF</Text></View><Text translate style={h.summaryFooter}>{state.enabled?'Demo balance':'Driver earnings'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Driver trip history" onPress={()=>nav.navigate('DriverTripHistory')} style={h.summary}><View style={h.between}><Text translate style={h.caption}>Trips</Text><Ionicons name="chevron-forward" size={16} color={colors.primary}/></View><View style={h.tripArea}><Text style={h.tripCount}>{completed}</Text></View><Text translate style={h.summaryFooter}>Completed trips</Text></Pressable></View>
    <View style={h.row}>{[{label:'Withdraw',asset:require('../../../assets/cash-withdrawal.png'),screen:state.enabled?'DriverPayout':'DriverVerificationStatus'},{label:'Top up',asset:require('../../../assets/topup.png'),screen:'DriverTopUp'}].map(item=><Pressable key={item.label} accessibilityRole="button" onPress={()=>nav.navigate(item.screen as 'DriverPayout')} style={h.tile}><Image source={item.asset} resizeMode="contain" style={h.tileImage}/><Text translate style={h.tileText}>{item.label}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel="Switch to rider" disabled={working} accessibilityState={{disabled:working}} onPress={()=>{if(working)return;dispatch({type:'online',value:false});selectRole('rider');}} style={[h.tile,working&&{opacity:.4}]}><Image source={require('../../../assets/switch.png')} resizeMode="contain" style={h.tileImage}/><Text translate style={h.tileText}>Switch role</Text></Pressable></View>
    <View style={h.between}><Text translate style={h.sectionTitle}>Your vehicle</Text><Pressable accessibilityRole="button" accessibilityLabel="Manage vehicle" onPress={()=>nav.navigate(state.enabled?'DriverVehicleHub':'DriverVehicle')} style={h.manage}><Text translate style={h.link}>Manage</Text><Ionicons name="chevron-forward" size={16} color={colors.primary}/></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Manage driver vehicle" onPress={()=>nav.navigate(state.enabled?'DriverVehicleHub':'DriverVehicle')} style={h.vehicle}><View style={h.flex}><Text translate style={h.category}>{state.enabled?isBike?'Delivery':'Comfort':suggestedVehicleCategory(application)||'Awaiting category'}</Text><Text style={h.vehicleName}>{state.enabled?isBike?'Honda Ace':'Toyota Yaris':[application.make,application.model].filter(Boolean).join(' ')||'Add your vehicle'}</Text><Text style={h.small}>{state.enabled?'SW 681 BS':application.plate||'Vehicle setup'}</Text></View><Image source={isBike?require('../../../assets/delivery.png'):require('../../../assets/cars/toyota--yaris--2013.png')} resizeMode="contain" style={h.vehicleImage}/></Pressable>
    <View style={h.between}><Text translate style={h.sectionTitle}>Your driving space</Text><Image source={require('../../../assets/full logo.png')} resizeMode="contain" style={{width:65,height:25}}/></View>
    <View style={h.menuGroup}>{[{title:'Driver documents',body:'Your documents and verification records',icon:'documents',route:state.enabled?'DriverDocumentsHub':'DriverDocuments'},{title:'Safety & support',body:'Get help when you need it',icon:'shield-outline',route:state.enabled?'DriverSafety':'ContactSupport'},{title:'Driver performance',body:'Ratings and completed journeys',icon:'star',route:'DriverPerformance'},{title:'Driving preferences',body:'Choose how you work',icon:'options',route:'DriverPreferences'},{title:'Verification details',body:state.enabled?'Verified demo profile':'View your application status',icon:'shield-checkmark-outline',route:state.enabled?'DriverDemoVerification':'DriverVerificationStatus'}].map((item,index)=><Pressable key={item.title} accessibilityRole="button" onPress={()=>nav.navigate(item.route as 'DriverPerformance')} style={[h.menuRow,index>0&&h.menuDivider]}><View style={h.menuIcon}>{item.icon.startsWith('shield')?<Image source={require('../../../assets/shield.png')} resizeMode="contain" style={h.menuAsset}/>:<Ionicons name={item.icon as 'star'} size={22} color={item.icon==='star'?colors.yellow:colors.primary}/>}</View><View style={h.flex}><Text translate style={h.menuTitle}>{item.title}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.yellow}/></Pressable>)}</View>
    {__DEV__&&!state.enabled&&<Pressable accessibilityRole="button" onPress={()=>nav.navigate('DriverDemo')} style={h.menuRow}><Text translate style={h.link}>Try verified driver demo</Text><Ionicons name="arrow-forward" size={21} color={colors.primaryDark}/></Pressable>}
   </ScrollView>
  </Animated.View>
  <Modal transparent visible={notices} animationType="slide" onRequestClose={()=>setNotices(false)}><View style={h.modalBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={()=>setNotices(false)} style={h.flex}/><View style={[h.notificationSheet,{paddingBottom:insets.bottom+20}]}><View style={h.between}><Text translate style={h.heading}>Notifications</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={()=>setNotices(false)} style={h.round}><Ionicons name="close" size={24} color={colors.navy}/></Pressable></View><NotificationList/></View></View></Modal>
 </View>;
}
const h=StyleSheet.create({
 screen:{flex:1,backgroundColor:colors.white,overflow:'hidden'},
 top:{position:'absolute',top:0,left:0,right:0,paddingHorizontal:24,gap:12},
 headerBackground:{position:'absolute',top:0,left:0,right:0,bottom:-12,backgroundColor:colors.white},
 row:{flexDirection:'row',alignItems:'center',gap:12},flex:{flex:1,gap:4},
 greeting:{fontSize:18,lineHeight:27,fontWeight:'500',color:colors.secondaryText},
 name:{fontSize:23,lineHeight:31,fontWeight:'600',color:colors.navy},
 round:{width:44,height:44,borderRadius:22,backgroundColor:colors.input,alignItems:'center',justifyContent:'center'},
 mapActions:{position:'absolute',right:24},
 sheet:{position:'absolute',bottom:0,left:0,right:0,borderTopLeftRadius:32,borderTopRightRadius:32,backgroundColor:colors.white,shadowColor:colors.navy,shadowOffset:{width:0,height:-4},shadowOpacity:.08,shadowRadius:14,elevation:6},
 handleArea:{height:36,alignItems:'center',justifyContent:'center'},handle:{width:36,height:4,borderRadius:3,backgroundColor:'#D9DFDB'},
 body:{paddingHorizontal:24,paddingTop:2,gap:16},
 heading:{fontSize:20,lineHeight:28,fontWeight:'600',color:colors.navy},
 small:{fontSize:11,lineHeight:18,fontWeight:'500',color:colors.secondaryText},
 statusCard:{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderRadius:20,backgroundColor:colors.input,minHeight:100},
 statusIcon:{width:48,height:48,borderRadius:16,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},
 powerIcon:{width:40,height:40},statusHeading:{flexDirection:'row',alignItems:'center',gap:6},statusDot:{width:6,height:6,borderRadius:3},statusTitle:{flex:1,fontSize:16,lineHeight:23,fontWeight:'600',color:colors.navy},
 demo:{paddingHorizontal:7,paddingVertical:4,borderRadius:8,backgroundColor:colors.white,fontSize:8,lineHeight:14,fontWeight:'600',color:colors.secondaryText},
 link:{fontSize:12,lineHeight:20,fontWeight:'500',color:colors.primary},
 summary:{flex:1,minWidth:0,minHeight:154,padding:14,gap:8,borderRadius:18,backgroundColor:colors.input},
 between:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
 caption:{fontSize:11,lineHeight:18,fontWeight:'500',color:colors.secondaryText,flexShrink:1},
 amountRow:{flexDirection:'row',alignItems:'baseline',gap:5},amount:{fontSize:26,lineHeight:38,fontWeight:'700',color:colors.navy,flexShrink:1},
 currency:{fontSize:11,lineHeight:18,fontWeight:'700',color:colors.yellow},
 tripArea:{justifyContent:'center'},tripCount:{fontSize:29,lineHeight:38,fontWeight:'700',color:colors.yellow},
 summaryFooter:{marginTop:'auto',fontSize:11,lineHeight:18,fontWeight:'500',color:colors.secondaryText},
 tile:{flex:1,minWidth:0,minHeight:86,alignItems:'center',justifyContent:'center',padding:12,gap:8,borderRadius:18,backgroundColor:colors.input},
 tileImage:{width:38,height:38},tileText:{fontSize:12,lineHeight:20,fontWeight:'500',color:colors.navy,textAlign:'center'},
 sectionTitle:{fontSize:16,lineHeight:25,fontWeight:'600',color:colors.navy},manage:{flexDirection:'row',alignItems:'center',gap:5,minHeight:40},
 vehicle:{flexDirection:'row',alignItems:'center',padding:18,minHeight:150,borderRadius:20,backgroundColor:colors.input,overflow:'hidden'},
 category:{fontSize:10,lineHeight:18,fontWeight:'600',color:colors.primary,paddingHorizontal:10,paddingVertical:4,borderRadius:12,backgroundColor:colors.white,alignSelf:'flex-start',marginBottom:6},
 vehicleName:{fontSize:17,lineHeight:25,fontWeight:'600',color:colors.navy},vehicleImage:{width:'46%',height:110},
 menuGroup:{backgroundColor:colors.input,borderRadius:20,paddingHorizontal:16},menuRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:82,paddingVertical:15},menuDivider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},
 menuIcon:{width:40,height:40,borderRadius:13,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},menuAsset:{width:24,height:24},menuTitle:{fontSize:13,lineHeight:21,fontWeight:'600',color:colors.navy},
 modalBackdrop:{flex:1,backgroundColor:'#121B2666'},notificationSheet:{padding:24,gap:18,backgroundColor:colors.white,borderTopLeftRadius:30,borderTopRightRadius:30},
});
