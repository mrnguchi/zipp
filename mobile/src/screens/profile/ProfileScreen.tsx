import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import { AppText as Text } from '../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
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

export function ProfileAvatar({ name, large = false }: { name: string; large?: boolean }) {
  const size = large ? 96 : 74;
  // Display only the portrait from the supplied design, without altering its pixels.
  const scale = size / 102;
  return <View style={[styles.avatar, large && styles.largeAvatar]} accessibilityLabel={`${name}'s profile photo`}>
    <Image source={require('../../../assets/profile-reference.jpg')} accessible={false} style={{ position: 'absolute', width: 661 * scale, height: 1280 * scale, left: -109 * scale, top: -262 * scale }} />
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
    <View style={styles.header}><Text translate style={styles.title}>Profile</Text><View style={styles.headerAccent} /></View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" accessibilityLabel="Manage Profile" onPress={() => navigation.navigate('ManageProfile')} style={styles.identity}>
        <ProfileAvatar name={name} />
        <View style={styles.identityText}><Text translate style={styles.name} numberOfLines={2}>{name}</Text><Text translate style={styles.email} numberOfLines={1}>{profile?.email || 'Add your email'}</Text></View>
      </Pressable>      {(driverAvailable||activeRole==='driver')&&<View style={{marginTop:18}}><AccountModeSwitch/></View>}
      {driverState.enabled&&<View style={[styles.group,{marginTop:18,paddingVertical:14}]}><Text translate style={{fontSize:14,fontWeight:'600',color:colors.primaryDark}}>Verified demo driver</Text><Text translate style={{fontSize:12,color:colors.secondaryText}}>Sample profile · Simulated trips and earnings</Text></View>}
      {profileSections.map(section => <View key={section.title} style={styles.section}>
        <Text translate style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.group}>
          {section.rows.map((row, index) => <Pressable key={row.screen} accessibilityRole="button" onPress={() => navigation.navigate(row.screen)} style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.pressed]}>
            <Ionicons name={row.icon} size={23} color={colors.primary} />
            <Text translate style={styles.rowTitle}>{row.label}</Text>
            {row.screen === 'ProfileLanguage' && <Text translate style={styles.value}>{i18n.resolvedLanguage === 'fr' ? 'Français' : 'English'}</Text>}
            <Ionicons name="arrow-forward" size={17} color="#626562" />
          </Pressable>)}
        </View>
      </View>)}
      {activeRole==='driver'&&<Pressable accessibilityRole="button" accessibilityLabel="Driver verification" onPress={()=>driverState.enabled?navigation.navigate('DriverDemoVerification'):navigation.navigate('DriverVerificationStatus')} style={[styles.group,styles.row,{marginTop:24,paddingHorizontal:16}]}><Ionicons name="shield-checkmark-outline" size={24} color={colors.primaryDark}/><Text translate style={styles.rowTitle}>Driver verification</Text><Ionicons name="chevron-forward" size={18} color={colors.secondaryText}/></Pressable>}
      {__DEV__&&!driverState.enabled&&<Pressable accessibilityRole="button" onPress={()=>navigation.navigate('DriverDemo')} style={[styles.group,styles.row,{marginTop:24,paddingHorizontal:16}]}><Ionicons name="flask-outline" size={24} color={colors.primaryDark}/><Text translate style={styles.rowTitle}>Try verified driver demo</Text><Ionicons name="chevron-forward" size={18} color={colors.secondaryText}/></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Log out" onPress={()=>{queryClient.clear();selectRole(null);logout();}} style={({pressed})=>[styles.logout,pressed&&styles.pressed]}><Ionicons name="log-out-outline" size={23} color={colors.error}/><Text translate style={styles.logoutLabel}>Log out</Text></Pressable>
      <Text translate style={styles.authorization}>Zipp authorization number{'\n'}CMR-2026-2532/233</Text>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  logout:{marginTop:26,minHeight:56,borderRadius:28,borderWidth:1,borderColor:'#E3B9B5',backgroundColor:colors.white,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},logoutLabel:{fontSize:16,lineHeight:24,fontWeight:'600',color:colors.error},
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1, backgroundColor: '#F7F7F7' },
  header: { height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  title: { fontSize: 21, fontWeight: '700', color: '#242725' },
  headerAccent: { position: 'absolute', bottom: 9, width: 24, height: 3, borderRadius: 2, backgroundColor: colors.yellow },
  content: { paddingHorizontal: 16, paddingTop: 20 },
  identity: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, gap: 18, minHeight: 108, borderWidth: 1, borderColor: colors.primarySoft },
  avatar: { width: 74, height: 74, borderRadius: 37, overflow: 'hidden', backgroundColor: '#E5E7E4', alignItems: 'center', justifyContent: 'center' },
  largeAvatar: { width: 96, height: 96, borderRadius: 48 },
  identityText: { flex: 1, gap: 6 },
  name: { fontSize: 20, fontWeight: '600', color: '#292D2C' },
  email: { fontSize: 14, color: colors.secondaryText },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.primaryDark, marginBottom: 11 },
  group: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 15, overflow: 'hidden' },
  row: { minHeight: 54, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0F1EF' },
  rowTitle: { flex: 1, fontSize: 16, color: '#292D2C', fontWeight: '500' },
  value: { fontSize: 14, color: colors.secondaryText },
  pressed: { opacity: 0.55 },
  authorization: { textAlign: 'center', fontSize: 12, lineHeight: 20, color: colors.secondaryText, marginTop: 30, marginBottom: 10 },
});
