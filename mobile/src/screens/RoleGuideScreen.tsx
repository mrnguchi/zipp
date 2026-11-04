import {LocalizedPressable as Pressable} from '../components/LocalizedNative';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {Image, ScrollView, StyleSheet, View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {RoleGuideArtwork,g} from './signup/RoleGuideDesign';
import { AppText as Text } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { useAppTheme } from '../hooks/useAppTheme';
import type { RootStackParamList } from '../navigation/types';

const guides = {
  rider: {
    introduction: 'Help deliveries reach their destination. Here are a few things to prepare before getting started.',
    steps: [
      ['Get to know the role', 'Riders collect and deliver items. Clear communication and careful handling help every delivery go smoothly.'],
      ['Prepare for the road', 'Check your motorcycle, helmet and delivery bag. Keep your phone charged and plan for safe journeys.'],
      ['Check what is required', 'Confirm the local licence, insurance and registration requirements that apply to delivery riding, along with Zipp’s onboarding requirements.'],
    ],
  },
  driver: {
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
        <Image source={require('../../assets/full logo.png')} resizeMode="contain" accessibilityLabel="Zipp" style={styles.logo}/><View style={styles.backButton}/>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text translate style={g.eyebrow}>Getting started</Text>
          <Text translate style={[styles.title, { color: colors.navy }]}>{role === 'driver' ? 'How to become a Zipp driver' : 'How to become a Zipp rider'}</Text>
          <Text translate style={[styles.body, { color: colors.secondaryText }]}>{guide.introduction}</Text>
        </View>
        <RoleGuideArtwork bike={role==='rider'}/>
        <Text translate style={g.heading}>Before you start</Text>
        <View style={g.list}>
        {guide.steps.map(([title, description], index) => (
          <View key={title} style={[g.row,index>0&&g.divider]}>
            <View style={[styles.stepNumber, { backgroundColor: colors.input }]}>
              <Text translate style={[styles.number, { color: colors.primary }]}>{index + 1}</Text>
            </View>
            <View style={styles.stepText}>
              <Text translate style={[styles.stepTitle, { color: colors.navy }]}>{title}</Text>
              <Text translate style={[styles.body, { color: colors.secondaryText }]}>{description}</Text>
            </View>
          </View>
        ))}
        </View>
      </ScrollView>
      <View style={styles.footer}><ActionButton accessibilityLabel="Check requirements" onPress={() => navigation.navigate('RoleRequirements', {role})}>Check requirements</ActionButton></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent:'space-between', gap: 12, paddingHorizontal: 24, paddingVertical: 10 },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  logo: {width:108,height:40},
  content: { padding: 24, gap: 22, paddingBottom: 36 },
  intro: { gap: 10 },
  title: { fontSize: 28, lineHeight: 37, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 25 },
  footer: {paddingHorizontal:24,paddingTop:12,paddingBottom:8},
  stepNumber: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 12, fontWeight: '600' },
  stepText: { flex: 1, gap: 6 },
  stepTitle: { fontSize: 17, lineHeight: 25, fontWeight: '600' },
});
