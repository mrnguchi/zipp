import {Alert,StyleSheet} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LocalizedPressable as Pressable} from './LocalizedNative';
import {AppText as Text} from './AppText';
import {useRole} from '../contexts/RoleContext';
import {useDriverWorkspace} from '../contexts/DriverWorkspaceContext';
import {useActivity} from '../contexts/ActivityContext';
import {activeDriverJob} from '../services/driverWorkspace';
import {colors} from '../constants/colors';
import {translateUI} from '../i18n/ui';
export function AccountModeSwitch(){
 const {activeRole,driverAvailable,selectRole}=useRole();const {state,dispatch}=useDriverWorkspace();const {records}=useActivity();
 if(!driverAvailable&&activeRole!=='driver')return null;
 const label=activeRole==='driver'?'Switch to rider':'Switch to driver';
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={()=>{
  const busy=activeRole==='driver'?activeDriverJob(state.job):records.some(record=>record.status==='active');
  if(busy){Alert.alert(translateUI('Finish your current trip'),translateUI('Complete or cancel your active trip before switching modes.'));return;}
  dispatch({type:'online',value:false});selectRole(activeRole==='driver'?'rider':'driver');
 }} style={({pressed})=>[styles.button,pressed&&{opacity:.7}]}><Ionicons name="swap-horizontal" size={19} color={colors.primaryDark}/><Text translate style={styles.label}>{label}</Text></Pressable>;
}
const styles=StyleSheet.create({button:{minHeight:44,alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:15,paddingVertical:10,borderWidth:1,borderColor:'#DDE3DF',borderRadius:24,backgroundColor:colors.white},label:{fontSize:13,lineHeight:21,fontWeight:'600',color:colors.primaryDark}});
