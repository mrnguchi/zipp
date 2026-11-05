import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors } from '../constants/colors';

export function ProfileIcon({style,color=colors.primary,...props}:ComponentProps<typeof Ionicons>) {
  return <Ionicons {...props} color={color} style={[{textShadowColor:color,textShadowOffset:{width:0,height:0},textShadowRadius:0.9},style]}/>;
}
