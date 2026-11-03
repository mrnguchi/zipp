import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText as Text } from '../components/AppText';
import { FloatingAppBar, appBarContentInset } from '../components/FloatingAppBar';
import type { AppTab } from '../components/FloatingAppBar';
import { colors } from '../constants/colors';
import { RoleHomeScreen } from './RoleHomeScreen';
import { ActivityScreen } from './ActivityScreen';
import { ProfileScreen } from './profile/ProfileScreen';
import { MessagesScreen } from './messaging/MessagesScreen';

const filters = ['All', 'Rides', 'Deliveries'] as const;

export function MainTabsScreen() {
  const [activeTab, setActiveTab] = useState<AppTab>('Home');
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const insets = useSafeAreaInsets();
  const contentBottomInset = appBarContentInset(insets.bottom);

  return (
    <View style={styles.screen}>
      <View style={styles.pages}>
        <View style={[styles.page, activeTab !== 'Home' && styles.hidden]}>
          <RoleHomeScreen contentBottomInset={contentBottomInset} onOpenActivity={() => setActiveTab('Activity')} />
        </View>
        {activeTab === 'Activity' && <ActivityScreen contentBottomInset={contentBottomInset} />}
        {activeTab === 'Messages' && <MessagesScreen bottomInset={contentBottomInset} />}
        {activeTab === 'Account' && <ProfileScreen bottomInset={contentBottomInset} />}
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
  filters: { flexDirection: 'row', gap: 8, marginTop: 24 },
  filter: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, backgroundColor: colors.input },
  selectedFilter: { backgroundColor: colors.primarySoft },
  filterLabel: { fontSize: 12, color: colors.secondaryText },
  selectedFilterLabel: { color: colors.primary, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48 },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.navy },
  emptyDescription: { maxWidth: 260, fontSize: 13, lineHeight: 22, color: colors.secondaryText, textAlign: 'center' },
  homeButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  homeButtonLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
