import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from '../components/AppText';
import { FormField } from '../components/FormField';
import { OtpInput } from '../components/OtpInput';
import { ActionButton } from '../components/ActionButton';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAwareScrollView';
import { usePasswordRecovery } from '../contexts/PasswordRecoveryContext';
import { useProfile } from '../contexts/ProfileContext';
import { normalizeRecoveryPhone, recoveryPasswordError } from '../services/passwordRecovery';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../constants/colors';

type Navigation=NativeStackNavigationProp<RootStackParamList>;
function Frame({title,description,icon,children,footer,onBack}:PropsWithChildren<{title:string;description:string;icon:React.ComponentProps<typeof Ionicons>['name']|'password-asset';footer:React.ReactNode;onBack:()=>void}>){
  return <SafeAreaView style={s.screen} edges={['top','bottom','left','right']}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==='ios'?'padding':'height'}>
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={s.back}><Ionicons name="arrow-back" size={22} color={colors.navy}/></Pressable><Image source={require('../../assets/full logo.png')} style={s.logo} resizeMode="contain"/><View style={s.spacer}/></View>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}><View style={s.hero}><View style={s.heroIcon}>{icon==='password-asset'?<Image source={require('../../assets/password.png')} resizeMode="contain" style={{width:36,height:36}}/>:<Ionicons name={icon} size={32} color={colors.primary}/>}</View><Text translate accessibilityRole="header" style={s.title}>{title}</Text><Text translate style={s.copy}>{description}</Text></View>{children}</ScrollView>
    <View style={s.footer}>{footer}</View>
  </KeyboardAvoidingView></SafeAreaView>;
}
function ErrorText({message}:{message:string}){return message?<Text translate accessibilityRole="alert" style={s.error}>{message}</Text>:null;}
function useAction(){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(false);
  async function run(action:()=>void){if(pending.current)return;pending.current=true;setBusy(true);setError('');Keyboard.dismiss();try{await Promise.resolve();action();}catch(problem){setError(problem instanceof Error?problem.message:'Please try again.');}finally{pending.current=false;setBusy(false);}}
  return {busy,error,setError,run};
}
export function ForgotPasswordScreen(){
  const navigation=useNavigation<Navigation>(),recovery=usePasswordRecovery(),{profile}=useProfile();
  const [phone,setPhone]=useState(recovery.state.phone||profile?.phone||(__DEV__?'612345678':''));const action=useAction();
  const send=()=>action.run(()=>{recovery.request(phone);navigation.navigate('ResetPasswordCode');});
  return <Frame title="Forgot password?" description="Enter your account phone number to reset your password." icon="password-asset" onBack={()=>navigation.goBack()} footer={<ActionButton accessibilityLabel="Send reset code" disabled={action.busy||!normalizeRecoveryPhone(phone)} onPress={()=>{void send();}}>{action.busy?'Sending code…':'Send reset code'}</ActionButton>}>
    <FormField label="Phone number" accessibilityLabel="Password recovery phone number" value={phone} onChangeText={value=>{setPhone(value);action.setError('');}} placeholder="6XX XXX XXX" keyboardType="phone-pad" autoComplete="tel" maxLength={18} returnKeyType="done" onSubmitEditing={()=>{if(normalizeRecoveryPhone(phone))void send();}} validate={value=>normalizeRecoveryPhone(value)?undefined:'Enter a valid Cameroon phone number.'}/>
    <Text translate style={s.noteText}>Use the phone number linked to your Zipp account.</Text><ErrorText message={action.error}/>
  </Frame>;
}
export function ResetPasswordCodeScreen(){
  const navigation=useNavigation<Navigation>(),recovery=usePasswordRecovery(),action=useAction();
  const [code,setCode]=useState(__DEV__?'123456':''),[now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const seconds=Math.max(0,Math.ceil((recovery.state.resendAt-now)/1000));
  const eligible=recovery.state.stage==='code';
  const verify=()=>action.run(()=>{recovery.verify(code);setCode('');navigation.replace('ResetPasswordNew');});
  return <Frame title="Check your phone" description="Enter the 6-digit code to verify your password reset." icon="chatbubble-ellipses-outline" onBack={()=>navigation.goBack()} footer={<ActionButton accessibilityLabel="Verify reset code" disabled={!eligible||code.length!==6||action.busy} onPress={()=>{void verify();}}>{action.busy?'Verifying…':'Verify code'}</ActionButton>}>
    <View style={s.phoneCard}><Text translate style={s.caption}>Phone number</Text><Text style={s.phone}>{recovery.state.phone}</Text><Pressable accessibilityRole="button" onPress={()=>navigation.goBack()}><Text translate style={s.link}>Change number</Text></Pressable></View>
    <OtpInput label="Password reset verification code" value={code} onChange={value=>{setCode(value);action.setError('');}} disabled={action.busy} onSubmit={()=>{if(code.length===6)void verify();}}/>
    <ErrorText message={action.error}/><Pressable accessibilityRole="button" accessibilityLabel="Resend reset code" disabled={seconds>0||action.busy||!eligible} onPress={()=>{void action.run(()=>{recovery.request(recovery.state.phone);setNow(Date.now());setCode('');});}} style={s.resend}><Text translate style={[s.link,seconds>0&&{color:colors.secondaryText}]}>{seconds>0?`Resend code in ${seconds}s`:'Resend code'}</Text></Pressable>
  </Frame>;
}
export function ResetPasswordNewScreen(){
  const navigation=useNavigation<Navigation>(),recovery=usePasswordRecovery(),action=useAction();
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const valid=!recoveryPasswordError(password,confirm)&&recovery.state.stage==='password';
  const reset=()=>action.run(()=>{recovery.complete(password,confirm);setPassword('');setConfirm('');navigation.replace('ResetPasswordSuccess');});
  return <Frame title="Create a new password" description="Choose a password you can remember and keep it private." icon="password-asset" onBack={()=>{recovery.clear();navigation.popTo('ForgotPassword');}} footer={<ActionButton accessibilityLabel="Reset password" disabled={!valid||action.busy} onPress={()=>{void reset();}}>{action.busy?'Resetting password…':'Reset password'}</ActionButton>}>
    <FormField label="New password" accessibilityLabel="New recovery password" value={password} onChangeText={value=>{setPassword(value);action.setError('');}} secureTextEntry autoComplete="new-password" placeholder="Enter your new password" maxLength={128} hint="Use at least 8 characters." validate={value=>value.length<8?'Use at least 8 characters.':undefined}/>
    <FormField label="Confirm password" accessibilityLabel="Confirm recovery password" value={confirm} onChangeText={value=>{setConfirm(value);action.setError('');}} secureTextEntry autoComplete="new-password" placeholder="Enter your password again" maxLength={128} onSubmitEditing={()=>{if(valid)void reset();}} validate={value=>value!==password?'Your passwords do not match.':undefined}/>
    <ErrorText message={action.error}/>
  </Frame>;
}
export function ResetPasswordSuccessScreen(){
  const navigation=useNavigation<Navigation>(),recovery=usePasswordRecovery();
  const done=()=>{recovery.clear();navigation.reset({index:0,routes:[{name:'Login'}]});};
  const success=recovery.state.stage==='success';
  return <Frame title={success?'Password reset':'Reset your password'} description={success?'Your password has been updated. Sign in to continue with Zipp.':'Start a new password reset to continue.'} icon="password-asset" onBack={done} footer={<ActionButton accessibilityLabel="Back to sign in" onPress={done}>Back to sign in</ActionButton>}>
    {success&&<View style={s.successCard}><View style={s.successIcon}><Ionicons name="checkmark" size={26} color={colors.navy}/></View><View style={s.flex}><Text translate style={s.successTitle}>You’re ready to go</Text><Text translate style={s.noteText}>Use your new password the next time you sign in.</Text></View></View>}
  </Frame>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:colors.white},flex:{flex:1},header:{paddingHorizontal:24,paddingTop:12,paddingBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{width:42,height:42,borderRadius:21,backgroundColor:colors.input,alignItems:'center',justifyContent:'center'},spacer:{width:42},logo:{width:100,height:35},body:{padding:24,gap:22,flexGrow:1},hero:{gap:13,paddingTop:15,paddingBottom:12},heroIcon:{width:68,height:68,borderRadius:23,backgroundColor:colors.input,alignItems:'center',justifyContent:'center',marginBottom:7},title:{fontSize:27,lineHeight:36,fontWeight:'700',color:colors.navy},copy:{fontSize:14,lineHeight:23,color:colors.secondaryText},footer:{paddingHorizontal:24,paddingTop:12,paddingBottom:16},note:{flexDirection:'row',alignItems:'center',gap:10},noteText:{flex:1,fontSize:12,lineHeight:20,color:colors.secondaryText},error:{fontSize:12,lineHeight:20,color:colors.error},phoneCard:{padding:18,gap:7,borderRadius:20,backgroundColor:colors.input},caption:{fontSize:11,color:colors.secondaryText},phone:{fontSize:17,fontWeight:'600',color:colors.navy},link:{fontSize:13,fontWeight:'600',color:colors.primary},code:{fontSize:23,letterSpacing:8},resend:{minHeight:44,alignItems:'center',justifyContent:'center'},successCard:{padding:20,borderRadius:20,backgroundColor:colors.input,flexDirection:'row',gap:14,alignItems:'center'},successIcon:{width:48,height:48,borderRadius:24,backgroundColor:colors.yellow,alignItems:'center',justifyContent:'center'},successTitle:{fontSize:16,fontWeight:'600',color:colors.navy,marginBottom:5}});
