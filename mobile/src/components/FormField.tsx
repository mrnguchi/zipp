import {LocalizedTextInput as TextInput} from './LocalizedNative';
import { useState } from 'react';
import {StyleSheet, View} from 'react-native';
import type { TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';

type Props = TextInputProps & {label:string; hint?:string; error?:string; validate?:(value:string)=>string|undefined};
export function FormField({label,hint,error,validate,onFocus,onBlur,style,value,...props}:Props) {
  const [focused,setFocused]=useState(false);
  const [touched,setTouched]=useState(false);
  const [hovered,setHovered]=useState(false);
  const issue=error || (touched&&!focused ? validate?.(value||'') : undefined);
  return <View style={s.field}>
    <Text translate style={s.label}>{label}</Text>
    <TextInput {...props} value={value} accessibilityLabel={props.accessibilityLabel||label} accessibilityHint={issue||hint||props.accessibilityHint}
      accessibilityState={{...props.accessibilityState,disabled:props.editable===false||props.accessibilityState?.disabled}}
      placeholderTextColor={colors.secondaryText} selectionColor={colors.primaryDark}
      onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}
      onFocus={event=>{setFocused(true);onFocus?.(event);}} onBlur={event=>{setFocused(false);setTouched(true);onBlur?.(event);}}
      style={[s.input,props.multiline&&s.multiline,style,hovered&&s.hovered,focused&&s.focused,!!issue&&s.invalid]}/>
    {!!issue?<View style={s.feedback}><Ionicons name="alert-circle-outline" size={17} color={colors.error}/><Text translate accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{issue}</Text></View>:hint?<Text translate style={s.hint}>{hint}</Text>:null}
  </View>;
}
const s=StyleSheet.create({field:{gap:8},label:{fontSize:14,lineHeight:22,fontWeight:'600',color:colors.navy},input:{minHeight:56,borderRadius:16,backgroundColor:colors.input,paddingHorizontal:15,paddingVertical:13,fontFamily:'Poppins_500Medium',fontSize:16,color:colors.navy},multiline:{minHeight:120,textAlignVertical:'top'},hovered:{backgroundColor:'#E8EAEE'},focused:{backgroundColor:'#E8EAEE'},invalid:{backgroundColor:'#FFF1F0'},feedback:{flexDirection:'row',alignItems:'flex-start',gap:6},error:{flex:1,fontSize:13,lineHeight:21,color:colors.error},hint:{fontSize:13,lineHeight:21,color:colors.secondaryText}});
