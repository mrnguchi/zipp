import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../../contexts/ProfileContext';
import type { RootStackParamList } from '../../navigation/types';
import { profileSections } from './profileData';
import { colors } from '../../constants/colors';

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
  const { profile } = useProfile();
  const { i18n } = useTranslation();
  const name = profile?.name || profile?.firstName || profile?.username || 'Suh';
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <View style={styles.header}><Text style={styles.title}>Profile</Text><View style={styles.headerAccent} /></View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" accessibilityLabel="Manage Profile" onPress={() => navigation.navigate('ManageProfile')} style={styles.identity}>
        <ProfileAvatar name={name} />
        <View style={styles.identityText}><Text style={styles.name} numberOfLines={2}>{name}</Text><Text style={styles.email} numberOfLines={1}>{profile?.email || 'Add your email'}</Text></View>
      </Pressable>
      {profileSections.map(section => <View key={section.title} style={styles.section}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <View style={styles.group}>
          {section.rows.map((row, index) => <Pressable key={row.screen} accessibilityRole="button" onPress={() => navigation.navigate(row.screen)} style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.pressed]}>
            <Ionicons name={row.icon} size={23} color={colors.primary} />
            <Text style={styles.rowTitle}>{row.label}</Text>
            {row.screen === 'ProfileLanguage' && <Text style={styles.value}>{i18n.resolvedLanguage === 'fr' ? 'Français' : 'English'}</Text>}
            <Ionicons name="arrow-forward" size={17} color="#626562" />
          </Pressable>)}
        </View>
      </View>)}
      <Text style={styles.authorization}>Zipp authorization number{'\n'}CMR-2026-2532/233</Text>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
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
  email: { fontSize: 14, color: '#939791' },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.primaryDark, marginBottom: 11 },
  group: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 15, overflow: 'hidden' },
  row: { minHeight: 54, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0F1EF' },
  rowTitle: { flex: 1, fontSize: 16, color: '#292D2C', fontWeight: '500' },
  value: { fontSize: 14, color: '#747871' },
  pressed: { opacity: 0.55 },
  authorization: { textAlign: 'center', fontSize: 12, lineHeight: 20, color: '#8A9088', marginTop: 30, marginBottom: 10 },
});
