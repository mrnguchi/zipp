import {Image,StyleSheet,View} from 'react-native';
import {AppText as Text} from '../../components/AppText';
import {colors} from '../../constants/colors';

export function RoleGuideArtwork({bike,compact=false}:{bike:boolean;compact?:boolean}){
  return <View style={[g.artwork,compact&&g.compact]}>
    <View style={g.portrait}><Image source={bike?require('../../../assets/how to be a rider.png'):require('../../../assets/how to be a driver.png')} resizeMode="contain" style={g.photo} accessibilityLabel={bike?'Zipp delivery rider':'Zipp driver'}/></View>
    <View style={g.artworkCopy}><View style={g.accent}/><Text translate style={g.role}>{bike?'Bike':'Vehicle'}</Text><Text translate style={g.caption}>{bike?'Deliver packages on your motorcycle.':'Drive passengers in your car.'}</Text></View>
  </View>;
}
export const g=StyleSheet.create({
  artwork:{flexDirection:'row',alignItems:'center',padding:12,gap:16,borderRadius:24,backgroundColor:colors.iconBackground},
  compact:{padding:10,gap:14},portrait:{width:'43%',maxWidth:156,aspectRatio:1,borderRadius:18,overflow:'hidden'},
  photo:{width:'100%',height:'100%'},artworkCopy:{flex:1,minWidth:0,gap:8,paddingVertical:8,paddingRight:4},
  accent:{width:28,height:4,borderRadius:2,backgroundColor:colors.yellow},role:{fontSize:18,lineHeight:27,fontWeight:'600',color:colors.navy},
  caption:{fontSize:14,lineHeight:23,color:colors.secondaryText},
  list:{borderWidth:1,borderColor:colors.border,borderRadius:24,paddingHorizontal:18,backgroundColor:colors.white},
  row:{flexDirection:'row',alignItems:'flex-start',gap:14,paddingVertical:19},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},
  icon:{width:42,height:42,borderRadius:14,backgroundColor:colors.iconBackground,alignItems:'center',justifyContent:'center'},
  intro:{gap:10},eyebrow:{fontSize:12,lineHeight:20,fontWeight:'600',letterSpacing:1.2,color:colors.primaryDark},
  title:{fontSize:27,lineHeight:36,fontWeight:'700',color:colors.navy},body:{fontSize:15,lineHeight:25,color:colors.secondaryText},
  heading:{fontSize:18,lineHeight:27,fontWeight:'600',color:colors.navy},
});
