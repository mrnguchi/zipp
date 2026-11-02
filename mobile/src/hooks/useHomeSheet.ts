import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder } from 'react-native';

export function useHomeSheet(screenHeight: number, topInset: number, collapsedRatio = 0.4) {
  const collapsedHeight = Math.round(screenHeight * collapsedRatio);
  const expandedHeight = Math.max(collapsedHeight, screenHeight - topInset - 12);
  const travel = expandedHeight - collapsedHeight;
  const [expanded, setExpanded] = useState(false);
  const translateY = useRef(new Animated.Value(travel)).current;
  const current = useRef(travel);
  const dragStart = useRef(travel);
  const reduceMotion = useRef(false);
  const snap = useCallback((open: boolean) => {
    setExpanded(open);
    translateY.stopAnimation();
    if (reduceMotion.current) translateY.setValue(open ? 0 : travel);
    else Animated.spring(translateY, { toValue: open ? 0 : travel, useNativeDriver: true, stiffness: 230, damping: 29, mass: 1, overshootClamping: true }).start();
  }, [translateY, travel]);
  useEffect(() => {
    const listener = translateY.addListener(({ value }) => { current.current = value; });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { reduceMotion.current = value; });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduceMotion.current = value; });
    return () => { translateY.removeListener(listener); translateY.stopAnimation(); subscription.remove(); };
  }, [translateY]);
  useEffect(() => { translateY.setValue(expanded ? 0 : travel); }, [travel]);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { dragStart.current = current.current; translateY.stopAnimation(value => { dragStart.current = value; }); },
    onPanResponderMove: (_, g) => translateY.setValue(Math.min(travel, Math.max(0, dragStart.current + g.dy))),
    onPanResponderRelease: (_, g) => snap(Math.abs(g.vy) > 0.25 ? g.vy < 0 : current.current < travel / 2),
    onPanResponderTerminate: () => snap(current.current < travel / 2),
  }), [snap, translateY, travel]);
  return { collapsedHeight, expandedHeight, travel, expanded, translateY, snap, panHandlers: pan.panHandlers };
}
