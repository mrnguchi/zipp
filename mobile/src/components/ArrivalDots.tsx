import { useEffect, useRef } from 'react';
import {AccessibilityInfo, Animated, StyleSheet, View} from 'react-native';
import { colors } from '../constants/colors';

export function ArrivalDots() {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let mounted = true;
    let animation: Animated.CompositeAnimation | undefined;
    function update(reduced: boolean) {
      animation?.stop();
      progress.setValue(0);
      if (!reduced && mounted) {
        animation = Animated.loop(Animated.sequence([
          Animated.timing(progress, { toValue: 1, duration: 650, useNativeDriver: true }),
          Animated.timing(progress, { toValue: 0, duration: 650, useNativeDriver: true }),
        ]));
        animation.start();
      }
    }
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) update(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => { mounted = false; listener.remove(); animation?.stop(); };
  }, [progress]);
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dots}>
    <Animated.View style={[styles.dot, { opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.3, 0.3] }) }]} />
    <Animated.View style={[styles.dot, { opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 0.3] }) }]} />
    <Animated.View style={[styles.dot, { opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.3, 1] }) }]} />
  </View>;
}
const styles = StyleSheet.create({
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 6, paddingTop: 5 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.navy },
});
