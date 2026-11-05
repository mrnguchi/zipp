import {Image,StyleSheet,View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Ionicons} from '@expo/vector-icons';
import {AppText as Text} from '../../components/AppText';
import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import {useDriverWorkspace} from '../../contexts/DriverWorkspaceContext';
import {useDriverOnboarding} from '../../contexts/DriverOnboardingContext';
import {suggestedVehicleCategory,vehicleConditions} from '../../services/driverOnboarding';
import {DEMO_DRIVER} from '../../services/driverWorkspace';
import {colors} from '../../constants/colors';
import type {RootStackParamList} from '../../navigation/types';
import {DriverPage} from './DriverUI';

export function DriverVehicleHub(){
 const nav=useNavigation<NativeStackNavigationProp<RootStackParamList>>(),{state}=useDriverWorkspace(),{application}=useDriverOnboarding();
 const bike=(state.enabled?state.kind:application.kind)==='bike';
 const name=state.enabled?(bike?'Honda Ace':'Toyota Yaris'):[application.make,application.model].filter(Boolean).join(' ')||'Your vehicle';
 const category=state.enabled?(bike?'Delivery':'Comfort'):suggestedVehicleCategory(application)||'Awaiting review';
 const verified=state.enabled||application.status==='approved';
 return <DriverPage title="Vehicle & category">
  <View style={s.hero}><View style={s.top}><Text translate style={s.category}>{category}</Text><View style={s.status}><View style={[s.dot,{backgroundColor:verified?colors.primary:colors.yellow}]}/><Text translate style={s.small}>{verified?'Verified':'Pending verification'}</Text></View></View><Image source={bike?require('../../../assets/delivery.png'):require('../../../assets/cars/toyota--yaris--2013.png')} resizeMode="contain" style={s.image}/><Text style={s.name}>{name}</Text><Text style={s.plate}>{state.enabled?DEMO_DRIVER.plate:application.plate||'Registration pending'}</Text></View>
  <Text translate style={s.heading}>Vehicle details</Text><View style={s.card}>{[['Colour',state.enabled?(bike?'Green':'White'):application.color||'Not provided'],['Condition',state.enabled?'Excellent':vehicleConditions.find(c=>c.value===application.condition)?.title||'Awaiting review'],['Service',bike?'Deliveries':'Passenger rides']].map(([label,value],i)=><View key={label} style={[s.detail,i>0&&s.divider]}><Text translate style={s.secondary}>{label}</Text><Text translate style={s.value}>{value}</Text></View>)}</View>
  <Text translate style={s.heading}>Your category</Text><View style={s.card}><View style={s.top}><View style={s.icon}><Ionicons name={bike?'bicycle-outline':'car-outline'} size={26} color={colors.primary}/></View><View style={{flex:1,gap:4}}><Text translate style={s.title}>{category}</Text><Text translate style={s.secondary}>{bike?'Package collection and delivery':'Your vehicle’s assigned ride category'}</Text></View></View><Text translate style={s.secondary}>{bike?'Your motorcycle is set up for courier requests.':'Categories are based on your vehicle and its condition. Any changes are reviewed before they apply.'}</Text></View>
  <Pressable accessibilityRole="button" accessibilityLabel="View vehicle documents" onPress={()=>nav.navigate(state.enabled?'DriverDocumentsHub':'DriverDocuments')} style={s.link}><View style={s.icon}><Ionicons name="documents-outline" size={24} color={colors.primary}/></View><View style={{flex:1}}><Text translate style={s.title}>Vehicle documents</Text><Text translate style={s.small}>Registration and verification records</Text></View><Ionicons name="chevron-forward" size={22} color={colors.yellow}/></Pressable>
  <Pressable accessibilityRole="button" onPress={()=>nav.navigate('ContactSupport')} style={s.link}><View style={s.icon}><Ionicons name="help-circle-outline" size={26} color={colors.primary}/></View><Text translate style={[s.title,{flex:1}]}>Need to update your vehicle?</Text><Ionicons name="chevron-forward" size={22} color={colors.yellow}/></Pressable>
 </DriverPage>;
}
const s=StyleSheet.create({hero:{padding:20,borderRadius:22,backgroundColor:colors.input,alignItems:'center',gap:8},top:{width:'100%',flexDirection:'row',alignItems:'center',gap:12},category:{paddingHorizontal:12,paddingVertical:7,borderRadius:12,backgroundColor:colors.yellow,color:colors.navy,fontSize:13,fontWeight:'600'},status:{flex:1,flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:6},dot:{width:7,height:7,borderRadius:4},small:{fontSize:12,lineHeight:19,color:colors.secondaryText},image:{width:'100%',height:160,marginVertical:8},name:{fontSize:26,lineHeight:36,fontWeight:'700',color:colors.navy},plate:{fontSize:16,lineHeight:24,fontWeight:'600',letterSpacing:1,color:colors.secondaryText},heading:{fontSize:20,fontWeight:'600',color:colors.navy},card:{padding:18,borderRadius:18,backgroundColor:colors.input,gap:16},detail:{flexDirection:'row',gap:16,alignItems:'center'},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,paddingTop:14},secondary:{fontSize:14,lineHeight:23,color:colors.secondaryText,flexShrink:1},value:{flex:1,textAlign:'right',fontSize:15,lineHeight:23,fontWeight:'600',color:colors.navy},icon:{width:44,height:44,borderRadius:14,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},title:{fontSize:16,lineHeight:24,fontWeight:'600',color:colors.navy},link:{padding:16,minHeight:80,borderRadius:18,backgroundColor:colors.input,flexDirection:'row',alignItems:'center',gap:12}});
