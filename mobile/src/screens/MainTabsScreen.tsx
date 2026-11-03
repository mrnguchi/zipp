import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText as Text } from '../components/AppText';
import { FloatingAppBar, appBarContentInset } from '../components/FloatingAppBar';
import type { AppTab } from '../components/FloatingAppBar';
import { colors } from '../constants/colors';
import { useRole } from '../contexts/RoleContext';
import type { RootStackParamList } from '../navigation/types';
import { RoleHomeScreen } from './RoleHomeScreen';
import { ActivityScreen } from './ActivityScreen';



export function MainTabsScreen() {
  const [activeTab, setActiveTab] = useState<AppTab>('Home');

  const insets = useSafeAreaInsets();
  const contentBottomInset = appBarContentInset(insets.bottom);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeRole } = useRole();

  return (
    <View style={styles.screen}>
      <View style={styles.pages}>
        <View style={[styles.page, activeTab !== 'Home' && styles.hidden]}>
          <RoleHomeScreen contentBottomInset={contentBottomInset} onOpenActivity={() => setActiveTab('Activity')} />
        </View>
        {activeTab === 'Activity' && <ActivityScreen contentBottomInset={contentBottomInset} />}
        {activeTab === 'Messages' && (
          <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={[styles.pageContent, { paddingBottom: contentBottomInset }]}>
              <Text style={styles.heading}>Messages</Text>
              <Text style={styles.subtitle}>Keep in touch with your driver.</Text>
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}><Ionicons name="chatbubbles-outline" size={30} color={colors.primary} /></View>
                <Text style={styles.emptyTitle}>Your conversations live here</Text>
                <Text style={styles.emptyDescription}>Once a driver is assigned, your ride conversation will appear here.</Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
        {activeTab === 'Account' && (
          <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={[styles.pageContent, { paddingBottom: contentBottomInset }]}>
              <Text style={styles.heading}>Account</Text>
              <Text style={styles.subtitle}>Your Zipp space.</Text>
              <View style={styles.accountSummary}>
                <View style={styles.emptyIcon}><Ionicons name="person-outline" size={28} color={colors.primary} /></View>
                <View style={styles.summaryText}>
                  <Text style={styles.emptyTitle}>Welcome to Zipp</Text>
                  <Text style={styles.subtitle}>{activeRole === 'driver' ? 'Driver' : 'Customer'} account</Text>
                </View>
              </View>
              <Text style={styles.sectionLabel}>EXPLORE ZIPP</Text>
              <View style={styles.accountLinks}>
                {(['driver', 'rider'] as const).map((role) => (
                  <Pressable
                    key={role}
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('RoleGuide', { role })}
                    style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}
                  >
                    <Ionicons name={role === 'driver' ? 'car-outline' : 'bicycle-outline'} size={21} color={colors.primary} />
                    <Text style={styles.accountRowLabel}>How to be a Zipp {role}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.secondaryText} />
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </View>
      <FloatingAppBar activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  pages: { flex: 1 },
  page: { flex: 1 },
  hidden: { display: 'none' },
  pageContent: { flexGrow: 1, padding: 24 },
  heading: { color: colors.navy, fontSize: 28, lineHeight: 38, fontWeight: '700' },
  subtitle: { color: colors.secondaryText, fontSize: 13, lineHeight: 21 },
  pressed: { opacity: 0.7 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48 },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.navy },
  emptyDescription: { maxWidth: 260, fontSize: 13, lineHeight: 22, color: colors.secondaryText, textAlign: 'center' },
  accountSummary: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 28 },
  summaryText: { flex: 1, gap: 3 },
  sectionLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2, color: colors.secondaryText, marginBottom: 12 },
  accountLinks: { backgroundColor: colors.input, borderRadius: 18, overflow: 'hidden' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 20 },
  accountRowLabel: { flex: 1, fontSize: 12, color: colors.navy },
});
