import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingAppBar, appBarContentInset } from '../components/FloatingAppBar';
import type { AppTab } from '../components/FloatingAppBar';
import { colors } from '../constants/colors';
import { RoleHomeScreen } from './RoleHomeScreen';
import { ActivityScreen } from './ActivityScreen';
import { ProfileScreen } from './profile/ProfileScreen';
import { MessagesScreen } from './messaging/MessagesScreen';

export function MainTabsScreen() {
  const [activeTab, setActiveTab] = useState<AppTab>('Home');
  const insets = useSafeAreaInsets();
  const contentBottomInset = appBarContentInset(insets.bottom);
  return <View style={styles.screen}>
    <View style={styles.pages}>
      <View style={[styles.page, activeTab !== 'Home' && styles.hidden]}><RoleHomeScreen contentBottomInset={contentBottomInset} onOpenActivity={() => setActiveTab('Activity')} /></View>
      {activeTab === 'Activity' && <ActivityScreen contentBottomInset={contentBottomInset} />}
      {activeTab === 'Messages' && <MessagesScreen bottomInset={contentBottomInset} />}
      {activeTab === 'Account' && <ProfileScreen bottomInset={contentBottomInset} />}
    </View>
    <FloatingAppBar activeTab={activeTab} onTabPress={setActiveTab} />
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.white }, pages: { flex: 1 }, page: { flex: 1 }, hidden: { display: 'none' } });
