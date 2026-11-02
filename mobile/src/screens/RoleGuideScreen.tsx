import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText as Text } from '../components/AppText';
import { useAppTheme } from '../hooks/useAppTheme';
import type { RootStackParamList } from '../navigation/types';

const guides = {
  rider: {
    image: require('../../assets/how to be a rider.png'),
    introduction: 'Help deliveries reach their destination. Here are a few things to prepare before getting started.',
    steps: [
      ['Get to know the role', 'Riders collect and deliver items. Clear communication and careful handling help every delivery go smoothly.'],
      ['Prepare for the road', 'Check your motorcycle, helmet and delivery bag. Keep your phone charged and plan for safe journeys.'],
      ['Check what is required', 'Confirm the local licence, insurance and registration requirements that apply to delivery riding, along with Zipp’s onboarding requirements.'],
    ],
  },
  driver: {
    image: require('../../assets/how to be a driver.png'),
    introduction: 'Make every journey feel welcoming. Here are a few things to prepare before getting started.',
    steps: [
      ['Get to know the role', 'Drivers help passengers reach their destination. Safe driving, clear pickup arrangements and a welcoming car make a difference.'],
      ['Prepare your vehicle', 'Check your tyres, lights and seat belts. Keep the car clean and your phone charged before heading out.'],
      ['Check what is required', 'Confirm the local licence, insurance and vehicle requirements that apply to passenger driving, along with Zipp’s onboarding requirements.'],
    ],
  },
} as const;

export function RoleGuideScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'RoleGuide'>) {
  const { colors } = useAppTheme();
  const { role } = route.params;
  const guide = guides[role];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.white }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          onPress={() => navigation.goBack()}
          style={[styles.backButton, { backgroundColor: colors.input }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.navy} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: colors.secondaryText }]}>Getting started</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={guide.image} resizeMode="cover" style={styles.heroImage} />
          {role === 'driver' && <View pointerEvents="none" style={styles.overlay} />}
        </View>
        <View style={styles.intro}>
          <Text style={[styles.title, { color: colors.navy }]}>How to become a Zipp {role}</Text>
          <Text style={[styles.body, { color: colors.secondaryText }]}>{guide.introduction}</Text>
        </View>
        {guide.steps.map(([title, description], index) => (
          <View key={title} style={[styles.step, { borderColor: colors.border }]}>
            <View style={[styles.stepNumber, { backgroundColor: colors.input }]}>
              <Text style={[styles.number, { color: colors.primary }]}>{index + 1}</Text>
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: colors.navy }]}>{title}</Text>
              <Text style={[styles.body, { color: colors.secondaryText }]}>{description}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 10 },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 13 },
  content: { padding: 24, gap: 22, paddingBottom: 36 },
  hero: { borderRadius: 22, overflow: 'hidden' },
  heroImage: { width: '100%', aspectRatio: 1 },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(18,27,38,0.18)' },
  intro: { gap: 10 },
  title: { fontSize: 24, lineHeight: 34, fontWeight: '600' },
  body: { fontSize: 13, lineHeight: 22 },
  step: { flexDirection: 'row', gap: 12, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  stepNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 12, fontWeight: '600' },
  stepText: { flex: 1, gap: 6 },
  stepTitle: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
});
