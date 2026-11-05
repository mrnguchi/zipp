import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import { AppText as Text } from '../../components/AppText';
import { ProfileIcon as Ionicons } from '../../components/ProfileIcon';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {Image, ScrollView, StyleSheet, View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../../contexts/ProfileContext';
import { useRole } from '../../contexts/RoleContext';
import { queryClient } from '../../query/client';
import type { RootStackParamList } from '../../navigation/types';
import { profileSections } from './profileData';
import { colors } from '../../constants/colors';
import {useDriverWorkspace} from '../../contexts/DriverWorkspaceContext';import {AccountModeSwitch} from '../../components/AccountModeSwitch';

export function ProfileAvatar({ name, large = false, uri }: { name: string; large?: boolean; uri?:string }) {
  const size = large ? 96 : 74;
  // Display only the portrait from the supplied design, without altering its pixels.
  const scale = size / 102;
  return <View style={[styles.avatar, large && styles.largeAvatar]} accessibilityLabel={`${name}'s profile photo`}>
    {uri?<Image source={{uri}} accessible={false} resizeMode="cover" style={{width:size,height:size}}/>:<Image source={require('../../../assets/profile-reference.jpg')} accessible={false} style={{ position: 'absolute', width: 661 * scale, height: 1280 * scale, left: -109 * scale, top: -262 * scale }} />}
  </View>;
}

export function ProfileScreen({ bottomInset }: { bottomInset: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, logout } = useProfile();
  const { activeRole,selectRole,driverAvailable } = useRole();
  const {state:driverState}=useDriverWorkspace();
  const { i18n } = useTranslation();
  const name = profile?.name || profile?.firstName || profile?.username || 'Suh';
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <View style={styles.header} accessible accessibilityLabel="Zipp Profile"><View style={styles.brandTitle}><Image source={require('../../../assets/full logo.png')} resizeMode="contain" style={styles.headerLogo} accessible={false}/><Text translate style={styles.title}>Profile</Text></View></View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" accessibilityLabel="Manage Profile" onPress={() => navigation.navigate('ManageProfile')} style={styles.identity}>
        <ProfileAvatar name={name} uri={profile?.photoUri}/>
        <View style={styles.identityText}><Text style={styles.name} numberOfLines={2}>{name}</Text><Text style={styles.phone} numberOfLines={1}>{profile?.phone || 'Add your phone number'}</Text><Text translate style={{fontSize:12,fontWeight:'500',color:colors.secondaryText}}>Manage profile</Text></View><View style={{width:32,height:32,borderRadius:16,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'}}><Ionicons name="chevron-forward" size={20} color={colors.yellow}/></View>
      </Pressable>      {(driverAvailable||activeRole==='driver')&&<View style={{marginTop:18}}><AccountModeSwitch/></View>}
      {driverState.enabled&&<View style={[styles.group,{marginTop:18,paddingVertical:14}]}><Text translate style={{fontSize:14,fontWeight:'600',color:colors.primaryDark}}>Verified demo driver</Text><Text translate style={{fontSize:12,color:colors.secondaryText}}>Sample profile · Simulated trips and earnings</Text></View>}
      {profileSections.map(section => <View key={section.title} style={styles.section}>
        <Text translate style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.group}>
          {section.rows.map((row, index) => <Pressable key={row.screen} accessibilityRole="button" onPress={() => navigation.navigate(row.screen)} style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.pressed]}>
            <Ionicons name={row.icon} size={23} color={colors.primary} />
            <Text translate style={styles.rowTitle}>{row.label}</Text>
            {row.screen === 'ProfileLanguage' && <Text translate style={styles.value}>{i18n.resolvedLanguage === 'fr' ? 'Français' : 'English'}</Text>}
            <Ionicons name="arrow-forward" size={17} color={colors.yellow} />
          </Pressable>)}
        </View>
      </View>)}
      {activeRole==='driver'&&<Pressable accessibilityRole="button" accessibilityLabel="Driver verification" onPress={()=>driverState.enabled?navigation.navigate('DriverDemoVerification'):navigation.navigate('DriverVerificationStatus')} style={[styles.group,styles.row,{marginTop:24,paddingHorizontal:16}]}><Ionicons name="shield-checkmark-outline" size={24} color={colors.primaryDark}/><Text translate style={styles.rowTitle}>Driver verification</Text><Ionicons name="chevron-forward" size={18} color={colors.yellow}/></Pressable>}
      {__DEV__&&!driverState.enabled&&<Pressable accessibilityRole="button" onPress={()=>navigation.navigate('DriverDemo')} style={[styles.group,styles.row,{marginTop:24,paddingHorizontal:16}]}><Ionicons name="flask-outline" size={24} color={colors.primaryDark}/><Text translate style={styles.rowTitle}>Try verified driver demo</Text><Ionicons name="chevron-forward" size={18} color={colors.yellow}/></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={()=>{queryClient.clear();selectRole(null);logout();}} style={({pressed})=>[styles.logout,pressed&&styles.pressed]}><View style={styles.exitTile}><Image source={require('../../../assets/exit.png')} resizeMode="contain" style={styles.exitIcon}/></View><Text translate style={styles.logoutLabel}>Log out</Text><Ionicons name="chevron-forward" size={20} color={colors.yellow}/></Pressable>
      <Text translate style={styles.authorization}>Zipp authorization number{'\n'}CMR-2026-2532/233</Text>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  logout:{marginTop:26,minHeight:72,borderRadius:20,backgroundColor:colors.input,paddingHorizontal:16,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:14},logoutLabel:{flex:1,fontSize:16,lineHeight:24,fontWeight:'600',color:colors.text},exitTile:{width:44,height:44,borderRadius:14,backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},exitIcon:{width:30,height:30},
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1, backgroundColor: colors.white },
  header: { height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  title: { fontSize: 22, fontWeight: '600', color: colors.text },
  brandTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  headerLogo: { width: 86, height: 32 },
  headerAccent: { position: 'absolute', bottom: 9, width: 24, height: 3, borderRadius: 2, backgroundColor: colors.yellow },
  content: { paddingHorizontal: 16, paddingTop: 20 },
  identity: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.input, borderRadius: 20, padding: 18, gap: 16, minHeight: 108 },
  avatar: { width: 74, height: 74, borderRadius: 37, overflow: 'hidden', backgroundColor: '#E5E7E4', alignItems: 'center', justifyContent: 'center' },
  largeAvatar: { width: 96, height: 96, borderRadius: 48 },
  identityText: { flex: 1, gap: 6 },
  name: { fontSize: 20, fontWeight: '600', color: '#292D2C' },
  phone: { fontSize: 14, color: colors.secondaryText },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 11 },
  group: { backgroundColor: colors.input, borderRadius: 18, paddingHorizontal: 15, overflow: 'hidden' },
  row: { minHeight: 54, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowTitle: { flex: 1, fontSize: 16, color: '#292D2C', fontWeight: '500' },
  value: { fontSize: 14, color: colors.secondaryText },
  pressed: { opacity: 0.55 },
  authorization: { textAlign: 'center', fontSize: 12, lineHeight: 20, color: colors.secondaryText, marginTop: 30, marginBottom: 10 },
});
