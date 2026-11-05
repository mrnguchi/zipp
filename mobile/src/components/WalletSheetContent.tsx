import {LocalizedPressable as Pressable} from './LocalizedNative';
import { useState } from 'react';
import {Image, ScrollView, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { ActionButton } from './ActionButton';
import { colors } from '../constants/colors';
import { useWallet } from '../contexts/WalletContext';
import type { WalletTransaction } from '../contexts/WalletContext';
import { profileDisplayName, useProfile } from '../contexts/ProfileContext';
import { useActivity } from '../contexts/ActivityContext';

const canvas = require('../../assets/wallet canvas.png');
const asset = Image.resolveAssetSource(canvas);
const canvasRatio = (asset?.width || 1536) / (asset?.height || 1024);
const money = (value: number) => value.toLocaleString('en-GB');
const dateLabel = (value: number) => new Date(value).toLocaleString('en-GB', {timeZone:'Africa/Douala',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
type Transaction = WalletTransaction & {title?:string};

export function WalletSheetContent({onTopUp}: {onTopUp:()=>void}) {
  const wallet=useWallet(); const {profile}=useProfile(); const {records}=useActivity();
  const [hidden,setHidden]=useState(false);
  const [viewAll,setViewAll]=useState(false);
  const [filter,setFilter]=useState<'All'|'Credits'|'Debits'>('All');
  const [selected,setSelected]=useState<Transaction|null>(null);
  const [previews]=useState<Transaction[]>(()=>__DEV__?[
    {id:'wallet-preview-topup',kind:'deposit',amount:10000,date:Date.now()-1800000,title:'Wallet top-up'},
    {id:'wallet-preview-ride',kind:'payment',amount:1500,date:Date.now()-7200000,title:'Everyday ride'},
    {id:'wallet-preview-delivery',kind:'payment',amount:2250,date:Date.now()-86400000,title:'Express delivery'},
    {id:'wallet-preview-fee',kind:'payment',amount:500,date:Date.now()-172800000,title:'Cancellation fee'},
  ]:[]);
  const transactions=[...wallet.transactions,...previews].sort((a,b)=>b.date-a.date);
  const shown=viewAll?transactions.filter(item=>filter==='All'||(filter==='Credits'?item.kind==='deposit':item.kind==='payment')):transactions.slice(0,3);
  const name=profileDisplayName(profile)||'Suh';
  function titleFor(item:Transaction) {
    const booking=records.find(record=>record.id===item.id);
    return item.title||(item.kind==='deposit'?'Wallet top-up':booking?.status==='canceled'?'Cancellation fee':booking?.title||'Wallet payment');
  }
  if(selected) {
    const incoming=selected.kind==='deposit'; const tone=incoming?colors.primary:colors.error;
    return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to transactions" onPress={()=>setSelected(null)} style={s.back}><Ionicons name="arrow-back" size={21} color={colors.navy}/><Text translate style={s.link}>Transactions</Text></Pressable>
      <View style={s.receiptHero}>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.heroArtwork}><View style={s.heroOrbit}/><View style={s.heroOrbitInner}/><View style={s.heroWatermark}><Ionicons name="wallet-outline" size={108} color="#E4E5E7"/></View></View>
        <View style={s.heroTop}><Text translate style={s.heroEyebrow}>ZIPP WALLET</Text><View style={s.heroAccent}/></View>
        <View style={s.heroIcon}><Ionicons name={incoming?'arrow-down':'arrow-up'} size={27} color={tone}/></View>
        <Text translate style={s.heroTitle}>{titleFor(selected)}</Text>
        <Text translate style={[s.receiptAmount,{color:tone}]}>{incoming?'+':'−'}{money(selected.amount)} XAF</Text>
        <View style={s.heroStatus}><Ionicons name="checkmark-circle" size={16} color={tone}/><Text translate style={s.heroStatusText}>{incoming?'Credit received':'Debit completed'}</Text></View>
      </View>
      <View style={s.receiptCard}>{[['Transaction type',incoming?'Credit':'Debit'],['Status','Completed'],['Date',dateLabel(selected.date)],['Account holder',name],['Reference',selected.id]].map(([label,value])=><View key={label} style={s.receiptRow}><Text translate style={s.secondary}>{label}</Text><Text translate selectable style={s.receiptValue}>{value}</Text></View>)}</View>
      {selected.id.startsWith('wallet-preview-')&&<Text translate style={s.secondary}>Sample transaction for development.</Text>}
      <ActionButton accessibilityLabel="Done viewing transaction" onPress={()=>setSelected(null)}>Done</ActionButton>
    </ScrollView>;
  }
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
    {viewAll?<View style={s.historyHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back to wallet overview" onPress={()=>setViewAll(false)} style={s.back}><Ionicons name="arrow-back" size={21} color={colors.navy}/><Text translate style={s.link}>Your wallet</Text></Pressable><Text translate style={s.historyTitle}>All transactions</Text><View style={s.filters}>{(['All','Credits','Debits'] as const).map(item=><Pressable key={item} accessibilityRole="tab" accessibilityState={{selected:filter===item}} onPress={()=>setFilter(item)} style={[s.filter,filter===item&&s.selectedFilter]}><Text translate style={[s.filterText,filter===item&&{color:colors.white}]}>{item}</Text></Pressable>)}</View></View>:<>
      <View style={s.canvas}><Image source={canvas} resizeMode="contain" style={[s.canvasImage,{aspectRatio:canvasRatio}]}/><View style={s.holder}><Text translate style={s.holderLabel}>ACCOUNT HOLDER</Text><Text translate numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={s.name}>{name}</Text></View><View style={s.details}><Text translate style={s.balanceLabel}>Available balance</Text><View style={s.amountRow}><Text translate numberOfLines={1} adjustsFontSizeToFit style={s.amount}>{hidden?'••••':money(wallet.available)}</Text><Text translate style={s.currency}>XAF</Text></View><View style={s.controls}><Pressable accessibilityRole="button" accessibilityLabel="Top up wallet" onPress={onTopUp} style={s.add}><Ionicons name="add" size={20} color={colors.white}/><Text translate style={s.addText}>Top up</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={hidden?'Show wallet balance':'Hide wallet balance'} onPress={()=>setHidden(!hidden)} style={s.eye}><Ionicons name={hidden?'eye-off-outline':'eye-outline'} size={21} color={colors.white}/></Pressable></View></View></View>
      {wallet.balance>wallet.available&&<View style={s.reserved}><Ionicons name="lock-closed-outline" size={18} color={colors.primary}/><Text translate style={[s.secondary,{flex:1}]}>{money(wallet.balance-wallet.available)} XAF reserved for active bookings</Text></View>}
      <View style={s.sectionHeading}><Text translate style={s.heading}>Transactions</Text><Pressable accessibilityRole="button" accessibilityLabel="View all wallet transactions" onPress={()=>setViewAll(true)} hitSlop={8}><Text translate style={s.link}>View all</Text></Pressable></View>
    </>}
    {!shown.length?<View style={s.empty}><View style={s.receiptIcon}><Ionicons name="receipt-outline" size={28} color={colors.primary}/></View><Text translate style={s.heading}>{transactions.length?'No matching transactions':'Your transactions, all here'}</Text><Text translate style={s.emptyCopy}>{transactions.length?'Choose another filter to see your transactions.':'Top-ups and payments will appear here as you use your wallet.'}</Text></View>:<View style={s.rows}>{shown.map(item=>{
      const incoming=item.kind==='deposit';const tone=incoming?colors.primary:colors.error;
      return <Pressable key={`${item.kind}-${item.id}`} accessibilityRole="button" accessibilityLabel={`View ${titleFor(item)} transaction details`} onPress={()=>setSelected(item)} style={s.transaction}><View style={s.transactionIcon}><Ionicons name={incoming?'arrow-down':'arrow-up'} size={21} color={tone}/></View><View style={s.transactionInfo}><Text translate numberOfLines={2} style={s.transactionTitle}>{titleFor(item)}</Text><Text translate style={s.date}>{dateLabel(item.date)}</Text></View><View style={s.transactionAmount}><Text translate style={[s.value,{color:tone}]}>{incoming?'+':'−'}{money(item.amount)}</Text><Text translate style={s.date}>XAF · {incoming?'Credit':'Debit'}</Text></View></Pressable>;
    })}</View>}
  </ScrollView>;
}
const s=StyleSheet.create({
  heroArtwork:{position:'absolute',top:0,bottom:0,left:0,right:0},heroOrbit:{position:'absolute',width:230,height:230,borderRadius:115,borderWidth:1,borderColor:'#E5E6E8',right:-100,top:-78},heroOrbitInner:{position:'absolute',width:180,height:180,borderRadius:90,borderWidth:1,borderColor:'#E5E6E8',right:-75,top:-53},heroWatermark:{position:'absolute',right:-17,bottom:15,transform:[{rotate:'-15deg'}]},heroTop:{alignSelf:'stretch',flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:2},heroEyebrow:{fontSize:10,lineHeight:16,fontWeight:'600',letterSpacing:1.5,color:colors.secondaryText},heroAccent:{width:24,height:4,borderRadius:2,backgroundColor:colors.yellow},heroIcon:{width:52,height:52,borderRadius:18,backgroundColor:colors.white,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#E9E9E9'},heroTitle:{fontSize:17,lineHeight:25,fontWeight:'600',color:colors.navy,textAlign:'center'},heroStatus:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:colors.white,borderRadius:20,paddingHorizontal:12,paddingVertical:7},heroStatusText:{fontSize:12,lineHeight:18,fontWeight:'500',color:colors.secondaryText},
  content:{paddingTop:4,paddingBottom:24,gap:20},canvas:{alignSelf:'stretch',marginHorizontal:-12,position:'relative',flexShrink:0,overflow:'hidden'},canvasImage:{width:'100%',height:undefined},holder:{position:'absolute',top:'16%',left:'9%',width:'43%',paddingLeft:10,gap:2},holderLabel:{fontSize:9,lineHeight:13,fontWeight:'600',letterSpacing:1,color:colors.secondaryText},name:{fontSize:16,lineHeight:22,fontWeight:'600',color:colors.navy},details:{position:'absolute',top:'42%',bottom:'13%',left:'9%',right:'9%',justifyContent:'space-between'},balanceLabel:{fontSize:14,lineHeight:22,color:'#CFD5DE'},amountRow:{flexDirection:'row',alignItems:'baseline',gap:7},amount:{fontSize:30,lineHeight:40,fontWeight:'700',color:colors.white,flexShrink:1},currency:{fontSize:16,fontWeight:'600',color:colors.yellow},controls:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},add:{flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:'#72808F',backgroundColor:'rgba(255,255,255,0.12)',paddingHorizontal:14,minHeight:38,borderRadius:20},addText:{fontSize:14,fontWeight:'600',color:colors.white},eye:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(255,255,255,0.12)',alignItems:'center',justifyContent:'center'},reserved:{flexDirection:'row',alignItems:'center',gap:8,padding:12,backgroundColor:colors.input,borderRadius:14},sectionHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},heading:{fontSize:19,lineHeight:27,fontWeight:'600',color:colors.navy},secondary:{fontSize:14,lineHeight:22,color:colors.secondaryText},link:{fontSize:14,lineHeight:22,fontWeight:'600',color:colors.primary},rows:{gap:12},transaction:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:colors.input,padding:14,minHeight:88,borderRadius:16},transactionIcon:{width:38,height:38,borderRadius:13,backgroundColor:colors.iconBackground,alignItems:'center',justifyContent:'center'},transactionInfo:{flex:1,minWidth:0,gap:5},transactionTitle:{fontSize:16,lineHeight:24,fontWeight:'600',color:colors.navy},date:{fontSize:12,lineHeight:19,color:colors.secondaryText},transactionAmount:{alignItems:'flex-end',gap:5,maxWidth:'36%'},value:{fontSize:17,lineHeight:25,fontWeight:'600'},empty:{padding:24,alignItems:'center',gap:12,backgroundColor:colors.input,borderRadius:18},emptyCopy:{fontSize:15,lineHeight:24,color:colors.secondaryText,textAlign:'center'},back:{flexDirection:'row',alignItems:'center',gap:10,minHeight:44},historyHeader:{gap:18},historyTitle:{fontSize:24,lineHeight:32,fontWeight:'700',color:colors.navy},filters:{flexDirection:'row',gap:8},filter:{paddingHorizontal:16,paddingVertical:10,borderRadius:22,backgroundColor:colors.iconBackground},selectedFilter:{backgroundColor:colors.primary},filterText:{fontSize:14,fontWeight:'500',color:colors.navy},receiptHero:{alignItems:'center',gap:10,padding:22,borderRadius:24,backgroundColor:'#F5F5F5',borderWidth:1,borderColor:'#E9E9E9',overflow:'hidden'},receiptIcon:{width:64,height:64,borderRadius:32,alignItems:'center',justifyContent:'center',backgroundColor:colors.iconBackground},receiptAmount:{fontSize:30,lineHeight:42,fontWeight:'700',textAlign:'center'},receiptCard:{gap:18,padding:18,borderRadius:20,backgroundColor:colors.input},receiptRow:{flexDirection:'row',alignItems:'flex-start',gap:16},receiptValue:{flex:1,fontSize:14,lineHeight:22,fontWeight:'500',color:colors.navy,textAlign:'right'},
});
