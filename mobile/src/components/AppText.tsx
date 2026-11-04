import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import type { TextProps, TextStyle } from 'react-native';
import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {translateUI} from '../i18n/ui';

import { theme } from '../theme';
import { screenTextScale } from '../utils/responsiveTypography';

type AppTextProps = TextProps & {translate?:boolean};

export function AppText({ style, translate=false, children, ...props }: AppTextProps) {
  useTranslation('ui',{useSuspense:false});
  const { width, height } = useWindowDimensions();
  const textStyle = StyleSheet.flatten(style);
  const fontWeight = textStyle?.fontWeight;
  const isBold = fontWeight === 'bold' || Number(fontWeight) >= 600;
  const scale = screenTextScale(width, height) * (isBold ? 1 : 1.02);
  const fontFamily =
    fontWeight === '900'
      ? theme.typography.black
      : fontWeight === '800'
        ? theme.typography.extraBold
        : fontWeight === '600'
          ? theme.typography.semiBold
          : fontWeight === '700' || fontWeight === 'bold'
        ? theme.typography.bold
        : fontWeight === '500'
          ? theme.typography.medium
          : theme.typography.regular;

  const resolvedStyle: TextStyle = {
    ...textStyle,
    fontFamily,
    fontWeight: undefined,
    fontSize: (textStyle?.fontSize ?? 14) * scale,
    ...(textStyle?.lineHeight !== undefined && { lineHeight: textStyle.lineHeight * scale }),
  };

  function localize(value:ReactNode):ReactNode {return typeof value==='string'?translateUI(value):Array.isArray(value)?value.map(localize):value;}
  return <Text {...props} style={resolvedStyle}>{translate?localize(children):children}</Text>;
}
