import { colors } from '../constants/colors';

export const theme = {
  colors,
  spacing: {
    small: 8,
    medium: 16,
    large: 24,
    xlarge: 32,
  },
  radius: {
    small: 12,
    medium: 16,
    large: 22,
    pill: 999,
  },
  typography: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semiBold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
    extraBold: 'Poppins_800ExtraBold',
    black: 'Poppins_900Black',
  },
} as const;
