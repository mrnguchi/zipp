import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LocalizedPressable as Pressable } from './LocalizedNative';
import { AppText as Text } from './AppText';
import { ProfileIcon as Ionicons } from './ProfileIcon';
import { changeAppLanguage } from '../i18n';
import { colors } from '../constants/colors';

const languages=[{code:'en',name:'English',description:'Use Zipp in English',badge:'EN'},{code:'fr',name:'Français',description:'Utiliser Zipp en français',badge:'FR'}] as const;
export function LanguagePicker() {
  const {i18n}=useTranslation();
  const [pending,setPending]=useState<string|null>(null);
  const [error,setError]=useState('');
  const busy=useRef(false);
  const current=(i18n.resolvedLanguage||i18n.language||'en').split('-')[0];
  const selected=pending||current;
  async function select(code:'en'|'fr') {
    if(busy.current||code===current)return;
    busy.current=true;setPending(code);setError('');
    try {await changeAppLanguage(code);}
    catch {setError('Could not change language. Please try again.');}
    finally {busy.current=false;setPending(null);}
  }
  return <View style={s.content}>
    <View style={s.hero}><View style={s.heroIcon}><Ionicons name="language" size={29} color={colors.primary}/></View><Text translate style={s.heading}>App language</Text><Text translate style={s.copy}>Choose your preferred app language.</Text></View>
    <View accessibilityRole="radiogroup" style={s.options}>
      {languages.map(language=>{
        const checked=selected===language.code;
        return <Pressable key={language.code} accessibilityRole="radio" accessibilityLabel={language.name} accessibilityState={{checked,disabled:pending!==null,busy:pending===language.code}} disabled={pending!==null} onPress={()=>{void select(language.code);}} style={({pressed})=>[s.option,checked&&s.selected,pressed&&{opacity:0.75}]}>
          <View style={[s.badge,checked&&s.selectedBadge]}><Text style={s.badgeText}>{language.badge}</Text></View>
          <View style={s.label}><Text style={s.name}>{language.name}</Text><Text style={s.description}>{language.description}</Text></View>
          {pending===language.code?<ActivityIndicator size="small" color={colors.navy}/>:<View style={[s.radio,checked&&s.checked]}>{checked&&<Ionicons name="checkmark" size={17} color={colors.white}/>}</View>}
        </Pressable>;
      })}
    </View>
    <View style={s.note}><Ionicons name="checkmark-circle-outline" size={19} color={colors.primary}/><Text translate style={s.noteText}>Your language preference is saved automatically.</Text></View>
    {Boolean(error)&&<Text translate accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
  </View>;
}
const s=StyleSheet.create({
  content:{gap:20},hero:{alignItems:'center',paddingVertical:12,gap:10},heroIcon:{width:62,height:62,borderRadius:21,backgroundColor:colors.input,alignItems:'center',justifyContent:'center'},heading:{fontSize:22,fontWeight:'600',color:colors.text},copy:{fontSize:13,lineHeight:21,color:colors.secondaryText,textAlign:'center'},options:{gap:12},option:{minHeight:92,padding:16,borderRadius:20,backgroundColor:colors.input,flexDirection:'row',alignItems:'center',gap:13},selected:{backgroundColor:colors.yellow},badge:{width:46,height:46,borderRadius:15,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},selectedBadge:{backgroundColor:'#FFFFFF99'},badgeText:{fontSize:14,fontWeight:'700',color:colors.navy},label:{flex:1,gap:5},name:{fontSize:16,fontWeight:'600',color:colors.text},description:{fontSize:11,lineHeight:18,color:colors.secondaryText},radio:{width:25,height:25,borderRadius:13,borderWidth:1.5,borderColor:'#A6ADB5',alignItems:'center',justifyContent:'center'},checked:{backgroundColor:colors.navy,borderColor:colors.navy},note:{flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:4},noteText:{flex:1,fontSize:12,lineHeight:20,color:colors.secondaryText},error:{fontSize:13,lineHeight:21,color:colors.error},
});
