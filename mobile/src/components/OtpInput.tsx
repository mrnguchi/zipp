import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle, TextInputInstance } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import { theme } from '../theme';

export function OtpInput({value,onChange,label,disabled=false,onSubmit,style,length=6,cellStyle}:{value:string;onChange:(value:string)=>void;label:string;disabled?:boolean;onSubmit?:()=>void;style?:StyleProp<ViewStyle>;length?:4|6;cellStyle?:StyleProp<ViewStyle>}) {
  const input=useRef<TextInputInstance>(null);
  return <Pressable onPress={()=>input.current?.focus()} disabled={disabled} accessible={false} style={[s.row,style]}>
    {Array.from({length},(_,index)=><View key={index} accessible={false} style={[s.cell,cellStyle]}><Text style={s.digit}>{value[index]||''}</Text></View>)}
    <TextInput ref={input} accessibilityLabel={label} value={value} editable={!disabled} onChangeText={text=>onChange(text.replace(/\D/g,'').slice(0,length))} autoComplete="one-time-code" textContentType="oneTimeCode" keyboardType="number-pad" maxLength={length} caretHidden selectionColor="transparent" underlineColorAndroid="transparent" onSubmitEditing={onSubmit} style={s.hidden}/>
  </Pressable>;
}
const s=StyleSheet.create({row:{width:'100%',flexDirection:'row',justifyContent:'space-between',gap:7},cell:{flex:1,maxWidth:44,height:54,borderRadius:25,backgroundColor:colors.input,alignItems:'center',justifyContent:'center'},digit:{fontSize:20,fontWeight:'600',color:colors.dark},hidden:{position:'absolute',top:0,right:0,bottom:0,left:0,color:'transparent',opacity:0,fontFamily:theme.typography.regular}});
