import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import { useRef, useState } from 'react';
import {Share, StyleSheet, View} from 'react-native';
import { ProfileIcon as Ionicons } from '../../components/ProfileIcon';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText as Text } from '../../components/AppText';
import { ActionButton } from '../../components/ActionButton';
import { colors } from '../../constants/colors';
import type { RootStackParamList } from '../../navigation/types';
import { ProfileFrame } from './ProfileDetailScreen';

const titles = {ReferAndEarn:'Refer & earn',ReferralInvite:'Invite friends',ReferralHowItWorks:'How it works',ReferralRewards:'Your rewards',ReferralTerms:'Referral terms'};
type ReferralRoute = keyof typeof titles;
const inviteUrl = process.env.EXPO_PUBLIC_ZIPP_INVITE_URL?.trim();
// Only an owner-configured HTTPS invitation URL may be shared. No invented
// referral codes, referral credits, or locally generated reward eligibility.
const safeInviteUrl = inviteUrl && /^https:\/\/[^\s@]+$/i.test(inviteUrl) ? inviteUrl : '';
const inviteMessage = `Join me on Zipp for rides and deliveries in Cameroon.${safeInviteUrl ? `\n${safeInviteUrl}` : ''}`;

function ReferralArtwork() {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.artwork}><View style={s.orbitOuter}/><View style={s.orbitInner}/><View style={s.watermark}><Ionicons name="gift-outline" size={116} color="#E4E5E7"/></View><View style={s.yellowStroke}/></View>;
}

export function ReferralScreen() {
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route=useRoute();const page=route.name as ReferralRoute;
  const [sharing,setSharing]=useState(false);const [error,setError]=useState('');
  const busy=useRef(false);
  async function shareInvitation() {
    if(busy.current)return;
    busy.current=true;setSharing(true);setError('');
    try { await Share.share({title:'Join me on Zipp',message:inviteMessage}); }
    catch { setError('Could not open sharing. Please try again.'); }
    finally { busy.current=false;setSharing(false); }
  }
  const row=(title:string,description:string,icon:React.ComponentProps<typeof Ionicons>['name'],screen:ReferralRoute)=><Pressable key={screen} accessibilityRole="button" onPress={()=>navigation.navigate(screen)} style={s.row}><View style={s.rowIcon}><Ionicons name={icon} size={23} color={colors.primary}/></View><View style={s.flex}><Text translate style={s.rowTitle}>{title}</Text><Text translate style={s.small}>{description}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.yellow}/></Pressable>;
  if(page==='ReferralInvite')return <ProfileFrame title={titles[page]}>
    <View style={s.hero}><ReferralArtwork/><View style={s.heroIcon}><Ionicons name="paper-plane-outline" size={37} color={colors.primary}/></View><Text translate style={[s.title,s.heroTitle]}>Good journeys are better shared.</Text><Text translate style={s.body}>Send an invitation using WhatsApp, Messages, or another app on your phone.</Text></View>
    <View style={s.card}><Text translate style={s.eyebrow}>YOUR INVITATION</Text><Text translate selectable style={s.body}>{inviteMessage}</Text></View>
    <ActionButton accessibilityLabel="Share Zipp invitation" disabled={sharing} onPress={()=>void shareInvitation()}>{sharing?'Opening sharing…':'Share invitation'}</ActionButton>
    {!!error&&<Text translate accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Text translate style={s.small}>Choose a recipient in your share sheet. Zipp does not access your contacts or send messages automatically.</Text>
    {row('How rewards work','See eligibility and reward information.','help-circle-outline','ReferralHowItWorks')}
  </ProfileFrame>;
  if(page==='ReferralHowItWorks')return <ProfileFrame title={titles[page]}>
    <Text translate style={s.title}>A little introduction. A new journey.</Text>
    {[
      ['Invite a friend','Share an invitation directly from Zipp using an app you already use.'],
      ['Check the active offer','When a referral offer is available, its reward amount and qualifying steps will appear here before you participate.'],
      ['Follow your rewards','Qualifying referrals and confirmed wallet rewards will appear in Your rewards after they have been verified.'],
    ].map(([title,body],index)=><View key={title} style={s.step}><View style={s.number}><Text translate style={s.numberText}>{index+1}</Text></View><View style={s.flex}><Text translate style={s.rowTitle}>{title}</Text><Text translate style={s.body}>{body}</Text></View></View>)}
    <View style={s.note}><Ionicons name="information-circle-outline" size={23} color={colors.primary}/><Text translate style={[s.body,s.flex]}>There is no active referral reward offer yet. Sharing an invitation currently does not earn wallet credit.</Text></View>
    <ActionButton accessibilityLabel="Open invitation" onPress={()=>navigation.navigate('ReferralInvite')}>Invite a friend</ActionButton>
    {row('Referral terms','Read programme details.','document-text-outline','ReferralTerms')}
  </ProfileFrame>;
  if(page==='ReferralRewards')return <ProfileFrame title={titles[page]}>
    <View style={s.rewardCard}><ReferralArtwork/><Text translate style={s.eyebrow}>CONFIRMED REWARDS</Text><Text translate style={s.rewardAmount}>0 <Text translate style={s.rewardCurrency}>XAF</Text></Text><Text translate style={s.small}>No referral credits recorded</Text></View>
    <View style={s.empty}><View style={s.heroIcon}><Ionicons name="gift-outline" size={37} color={colors.primary}/></View><Text translate style={s.rowTitle}>Your rewards will live here</Text><Text translate style={[s.body,s.center]}>Once a referral offer is active, you’ll be able to follow qualifying referrals and see confirmed rewards here.</Text></View>
    <View style={s.note}><Ionicons name="time-outline" size={23} color={colors.primary}/><Text translate style={[s.small,s.flex]}>Reward tracking and wallet payouts are not connected yet. No money has been added to your wallet.</Text></View>
    <ActionButton accessibilityLabel="Learn how referrals work" onPress={()=>navigation.navigate('ReferralHowItWorks')}>How it works</ActionButton>
  </ProfileFrame>;
  if(page==='ReferralTerms')return <ProfileFrame title={titles[page]}>
    <Text translate style={s.title}>Clear terms before you share.</Text>
    {[
      ['Offer availability','No paid referral offer is active at present. Invitations can be shared without a reward.'],
      ['Eligibility & qualifying activity','A future offer must state who qualifies, what your friend needs to complete, and when the offer ends. Those details will be shown before participation.'],
      ['Rewards & payment','No reward amount or payment date has been announced. Only verified rewards may be credited to a wallet; opening the share sheet is not a completed referral.'],
      ['Your privacy','You choose the recipient in your phone’s share sheet. Zipp does not upload your address book as part of this flow.'],
    ].map(([title,body])=><View key={title} style={s.card}><Text translate style={s.rowTitle}>{title}</Text><Text translate style={s.body}>{body}</Text></View>)}
    <ActionButton accessibilityLabel="Contact support about referrals" onPress={()=>navigation.navigate('ContactSupport')}>Contact support</ActionButton>
  </ProfileFrame>;
  return <ProfileFrame title={titles.ReferAndEarn}>
    <View style={s.hero}><ReferralArtwork/><View style={s.heroAccent}/><View style={s.heroIcon}><Ionicons name="gift-outline" size={40} color={colors.primary}/></View><Text translate style={[s.title,s.heroTitle]}>Bring your people along for the ride.</Text><Text translate style={[s.body,s.heroCopy]}>Introduce a friend to Zipp and keep an eye out for referral rewards.</Text></View>
    <View style={s.offer}><Ionicons name="sparkles-outline" size={22} color={colors.primary}/><View style={s.flex}><Text translate style={s.rowTitle}>More to look forward to</Text><Text translate style={s.small}>No reward offer is active yet. You can still invite your friends to Zipp.</Text></View></View>
    <ActionButton accessibilityLabel="Invite friends to Zipp" onPress={()=>navigation.navigate('ReferralInvite')}>Invite friends</ActionButton>
    <View style={s.card}>{row('How it works','From invitation to verified reward.','help-circle-outline','ReferralHowItWorks')}{row('Your rewards','View referral reward activity.','wallet-outline','ReferralRewards')}{row('Referral terms','Know the details before joining an offer.','document-text-outline','ReferralTerms')}</View>
  </ProfileFrame>;
}
const s=StyleSheet.create({
  artwork:{position:'absolute',top:0,bottom:0,left:0,right:0},orbitOuter:{position:'absolute',width:230,height:230,borderRadius:115,borderWidth:1,borderColor:'#E0E2E4',right:-100,top:-85},orbitInner:{position:'absolute',width:180,height:180,borderRadius:90,borderWidth:1,borderColor:'#E0E2E4',right:-75,top:-60},watermark:{position:'absolute',right:-22,bottom:28,transform:[{rotate:'-15deg'}]},yellowStroke:{position:'absolute',width:64,height:5,right:-12,bottom:28,borderRadius:3,backgroundColor:colors.yellow,transform:[{rotate:'-40deg'}]},heroTitle:{textAlign:'left',fontSize:24,lineHeight:33,maxWidth:245},heroCopy:{textAlign:'left',maxWidth:270},
  flex:{flex:1,gap:5},hero:{position:'relative',alignItems:'flex-start',padding:24,gap:16,borderRadius:24,borderColor:'#E5E6E8',overflow:'hidden',backgroundColor:colors.input,borderWidth:0},heroAccent:{position:'absolute',top:0,right:26,width:32,height:4,borderBottomLeftRadius:3,borderBottomRightRadius:3,backgroundColor:colors.yellow},heroIcon:{width:64,height:64,borderRadius:21,alignItems:'center',justifyContent:'center',borderColor:colors.border,backgroundColor:colors.input,borderWidth:0},title:{fontSize:25,lineHeight:35,fontWeight:'700',color:colors.navy,textAlign:'center'},body:{fontSize:15,lineHeight:25,color:colors.secondaryText},center:{textAlign:'center'},small:{fontSize:13,lineHeight:21,color:colors.secondaryText},rowTitle:{fontSize:17,lineHeight:25,fontWeight:'600',color:colors.navy},row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:76,paddingVertical:10},rowIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.input},card:{padding:20,gap:12,borderColor:'#ECEDEE',backgroundColor:colors.input,borderRadius:18,borderWidth:0},offer:{flexDirection:'row',gap:12,padding:18,backgroundColor:colors.input,borderRadius:18},note:{flexDirection:'row',gap:12,padding:16,borderRadius:18,backgroundColor:colors.input},eyebrow:{fontSize:11,lineHeight:18,letterSpacing:1,fontWeight:'600',color:colors.secondaryText},step:{flexDirection:'row',gap:15,paddingVertical:12},number:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.input},numberText:{fontSize:15,fontWeight:'600',color:colors.primary},rewardCard:{position:'relative',overflow:'hidden',padding:24,gap:12,borderRadius:24,borderColor:'#E5E6E8',backgroundColor:colors.input,borderWidth:0},rewardAmount:{fontSize:38,lineHeight:48,fontWeight:'700',color:colors.primary},rewardCurrency:{fontSize:18},empty:{alignItems:'center',paddingVertical:26,gap:16},error:{fontSize:14,lineHeight:22,color:colors.error},
});
