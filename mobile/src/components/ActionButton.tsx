import {LocalizedPressable as Pressable} from './LocalizedNative';
import type { PropsWithChildren } from 'react';
import {StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PressableProps } from 'react-native';

import { AppText as Text } from './AppText';
import { colors as palette } from '../constants/colors';
import { useAppTheme } from '../hooks/useAppTheme';

type ActionButtonProps = PropsWithChildren<{
  onPress: PressableProps['onPress'];
  accessibilityLabel: string;
  disabled?: boolean;
  tone?: 'primary'|'danger';
  arrow?: 'arrow-forward' | 'arrow-back' | 'add';
}>;

export function ActionButton({
  children,
  onPress,
  accessibilityLabel,
  disabled = false,
  tone = 'primary',
  arrow = 'arrow-forward',
}: ActionButtonProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.primaryDark },
        tone==='danger'&&{backgroundColor:palette.error},
        styles.shadow,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text translate style={[styles.label, { color: colors.white }]}>{children}</Text>
      <View style={styles.arrow}><Ionicons name={arrow} size={21} color={palette.navy} /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 999,
    paddingLeft: 22,
    paddingRight: 8,
    paddingVertical: 8,
    gap: 12,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.yellow, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  shadow: {
    elevation: 3,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },
  pressed: {
    opacity: 0.82,
  },
});
