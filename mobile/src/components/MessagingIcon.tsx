import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

// A small matching shadow adds weight without changing the icon's silhouette.
export function MessagingIcon({style,color = '#121B26',...props}: ComponentProps<typeof Ionicons>) {
  return <Ionicons {...props} color={color} style={[{textShadowColor:color,textShadowOffset:{width:0,height:0},textShadowRadius:0.6},style]} />;
}
