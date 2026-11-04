import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { theme } from '../theme';

// Shared with Login so every form uses the same field appearance.
export const inputStyles = StyleSheet.create({
  field: {
    minHeight: 50,
    borderRadius: 25,
    borderWidth: 0,
    overflow: 'hidden',
    backgroundColor: colors.input,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: theme.typography.regular,
    color: colors.navy,
  },
  container: {
    minHeight: 50,
    borderRadius: 25,
    borderWidth: 0,
    overflow: 'hidden',
    backgroundColor: colors.input,
    paddingHorizontal: 16,
  },
  text: {
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: theme.typography.regular,
    color: colors.navy,
  },
});
