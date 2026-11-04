import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { inputStyles } from '../constants/inputStyles';

export function PasswordInput({ style, ...props }: TextInputProps) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.field}>
    <TextInput {...props} autoCapitalize="none" autoCorrect={false} underlineColorAndroid="transparent" secureTextEntry={!visible} style={[styles.text, style]} />
    <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} accessibilityState={{ checked: visible }} onPress={() => setVisible(value => !value)} style={styles.eye}>
      <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={23} color={colors.yellow} />
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  field: { ...inputStyles.container, paddingHorizontal: 0, borderRadius: 25, overflow: 'hidden', position: 'relative' },
  text: { ...inputStyles.text, minHeight: 50, paddingLeft: 16, paddingRight: 56, minWidth: 0 },
  eye: { position: 'absolute', top: 0, right: 4, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' },
});
