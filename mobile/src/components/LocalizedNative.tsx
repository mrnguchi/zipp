import {Pressable,TextInput,Text} from 'react-native';
import type {ComponentProps,PropsWithChildren} from 'react';
import {useTranslation} from 'react-i18next';
import {translateUI} from '../i18n/ui';
import {colors} from '../constants/colors';

export function LocalizedPressable(props:ComponentProps<typeof Pressable>){
  useTranslation('ui',{useSuspense:false});
  const choice=props.accessibilityRole==='radio';
  const selection=choice?{borderWidth:0,...(props.accessibilityState?.checked?{backgroundColor:colors.yellow}:{})}:undefined;
  const originalStyle=props.style;
  const style:ComponentProps<typeof Pressable>['style']=typeof originalStyle==='function'?state=>[originalStyle(state),selection]:[originalStyle,selection];
  return <Pressable {...props} style={style} accessibilityLabel={translateUI(props.accessibilityLabel)} accessibilityHint={translateUI(props.accessibilityHint)}/>;
}
export function LocalizedTextInput(props:ComponentProps<typeof TextInput>){
  useTranslation('ui',{useSuspense:false});
  return <TextInput {...props} underlineColorAndroid="transparent" style={[props.style,{borderWidth:0,borderTopWidth:0,borderBottomWidth:0,borderLeftWidth:0,borderRightWidth:0}]} placeholder={translateUI(props.placeholder)} accessibilityLabel={translateUI(props.accessibilityLabel)} accessibilityHint={translateUI(props.accessibilityHint)}/>;
}
// Nested native Text inherits typography and preserves user-provided content.
export function Untranslated({children}:PropsWithChildren){return <Text>{children}</Text>;}
