import { useMemo } from 'react';
import type { PropsWithChildren } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../constants/colors';

type Props = PropsWithChildren<{
  height: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}>;

export function RideBottomSheet({ height, expanded, onExpandedChange, children }: Props) {
  const gesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 8,
    onPanResponderRelease: (_, { dy }) => {
      if (Math.abs(dy) > 24) onExpandedChange(dy < 0);
    },
  }), [onExpandedChange]);

  return <View style={[styles.sheet, { height }]}>
    <View {...gesture.panHandlers}>
      <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse ride details' : 'Expand ride details'} accessibilityState={{ expanded }} onPress={() => onExpandedChange(!expanded)} style={styles.handleArea}>
        <View style={styles.handle} />
      </Pressable>
    </View>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, shadowColor: colors.navy, shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 12 },
  handleArea: { height: 30, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D8DDE0' },
});
