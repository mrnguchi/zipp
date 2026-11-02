import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';

const tabs = [
  { name: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'Activity', icon: 'time-outline', activeIcon: 'time' },
  { name: 'Messages', icon: 'chatbubble-outline', activeIcon: 'chatbubble' },
  { name: 'Account', icon: 'person-outline', activeIcon: 'person' },
] as const;

export type AppTab = (typeof tabs)[number]['name'];
const BAR_HEIGHT = 66;
export const appBarContentInset = (bottomInset: number) => BAR_HEIGHT + Math.max(bottomInset, 12) + 24;

type FloatingAppBarProps = {
  activeTab: AppTab;
  onTabPress: (tab: AppTab) => void;
};

export function FloatingAppBar({ activeTab, onTabPress }: FloatingAppBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={[styles.bar, { bottom: Math.max(insets.bottom, 12) }]} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const selected = activeTab === tab.name;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityLabel={tab.name}
              accessibilityState={{ selected }}
              onPress={() => onTabPress(tab.name)}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <View style={[styles.iconWrap, selected && styles.activeIconWrap]}>
                <Ionicons name={selected ? tab.activeIcon : tab.icon} size={23} color={selected ? '#FFFFFF' : '#999DA1'} />
              </View>
              <Text style={[styles.label, selected && styles.activeLabel]}>{tab.name}</Text>
              <View style={[styles.dot, selected && styles.activeDot]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  bar: {
    position: 'absolute', left: 24, right: 24, height: BAR_HEIGHT, borderRadius: 34,
    backgroundColor: colors.navy, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  tab: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
  iconWrap: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  activeIconWrap: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 2.5, borderColor: '#24C77A',
    backgroundColor: colors.navy, marginTop: -12, marginBottom: 2,
    shadowColor: '#24C77A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.28, shadowRadius: 7,
  },
  label: { color: '#999DA1', fontSize: 10, lineHeight: 15, fontWeight: '500' },
  activeLabel: { color: '#FFFFFF' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: 'transparent' },
  activeDot: { backgroundColor: '#24C77A' },
  pressed: { opacity: 0.7 },
});
