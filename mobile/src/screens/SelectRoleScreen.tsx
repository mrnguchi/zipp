import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import { colors as palette } from '../constants/colors';
import { AppText as Text } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { useRole } from '../contexts/RoleContext';
import { useAppTheme } from '../hooks/useAppTheme';
import type { RootStackParamList } from '../navigation/types';
import type { UserRole } from '../types/domain';

const selectableRoles: UserRole[] = ['rider', 'driver'];

const roleArtwork: Record<UserRole, number> = {
  rider: require('../../assets/ride booking.png'),
  sender: require('../../assets/ride booking.png'),
  driver: require('../../assets/delivery.png'),
};

export function SelectRoleScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { selectRole } = useRole();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const toggleRole = (role: UserRole) => {
    setSelectedRole((current) => (current === role ? null : role));
  };

  const continueToHome = () => {
    selectRole(selectedRole ?? 'sender');
    navigation.navigate('RoleHome');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => navigation.goBack()}
          style={styles.back}
        >
          <Text style={[styles.backLabel, { color: colors.dark }]}>
            {t('common.back')}
          </Text>
        </Pressable>

        <Image
          accessibilityLabel="Zipp"
          source={require('../../assets/full logo.png')}
          resizeMode="contain"
          style={styles.logo}
        />
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          {t('selectRole.eyebrow')}
        </Text>
        <Text style={[styles.heading, { color: colors.secondaryText }]}>
          {t('selectRole.promptPrefix')}{' '}
          <Text style={{ color: colors.primary }}>{t('selectRole.getStarted')}</Text>
          {t('selectRole.promptSuffix')}
        </Text>

        <View style={styles.footer}>
          <View style={styles.roleList}>
          {selectableRoles.map((role) => {
            const selected = selectedRole === role;
            return (
              <Pressable
                key={role}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t(`selectRole.${role}`)}
                onPress={() => toggleRole(role)}
                style={[
                  styles.roleCard,
                  { backgroundColor: selected ? palette.primarySoft : colors.input },
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.roleTitle, { color: colors.primary }]}>
                    {t(`selectRole.${role}`)}
                  </Text>
                  <View
                    style={[
                      styles.selectionDot,
                      { backgroundColor: selected ? colors.primary : colors.gray },
                    ]}
                  />
                </View>
                <Image
                  accessibilityLabel={t(`selectRole.${role}Image`)}
                  source={roleArtwork[role]}
                  resizeMode="contain"
                  style={styles.roleImage}
                />
              </Pressable>
            );
          })}
          </View>

          <View style={styles.actionButtonWrap}>
            <ActionButton
              accessibilityLabel={t('selectRole.getStarted')}
              onPress={continueToHome}
            >
              {t('selectRole.getStarted')}
            </ActionButton>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 18,
  },
  back: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
  },
  backLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  logo: {
    width: 160,
    height: 64,
    marginTop: 2,
    marginBottom: 10,
  },
  eyebrow: {
    width: '100%',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  heading: {
    width: '100%',
    marginTop: 3,
    marginBottom: 22,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 30,
  },
  roleList: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  roleCard: {
    flex: 1,
    height: 180,
    overflow: 'visible',
    borderRadius: 17,
    padding: 13,
    elevation: 3,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectionDot: {
    width: 17,
    height: 17,
    borderRadius: 9,
  },
  roleImage: {
    flex: 1,
    width: '100%',
    marginTop: 6,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
    marginTop: 'auto',
    paddingTop: 18,
  },
  actionButtonWrap: {
    width: '100%',
    alignItems: 'stretch',
  },
});
