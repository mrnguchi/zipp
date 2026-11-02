import { useEffect, useRef, useState } from 'react';
// Explicit development fixture, independent from live dispatch events.
export function useArrivalSimulation(rideId: string | undefined, active: boolean, onArrived: () => void) {
  const [state, setState] = useState({ id: '', progress: 0 });
  const started = useRef<{ id: string; time: number } | null>(null);
  const callback = useRef(onArrived);
  callback.current = onArrived;
  useEffect(() => {
    if (!rideId || !active || !__DEV__) return;
    if (started.current?.id !== rideId) started.current = { id: rideId, time: Date.now() };
    const start = started.current.time;
    const update = () => {
      const progress = Math.min(1, (Date.now() - start) / 10000);
      setState({ id: rideId, progress });
      if (progress >= 1) { clearInterval(timer); callback.current(); }
    };
    const timer = setInterval(update, 80);
    update();
    return () => clearInterval(timer);
  }, [rideId, active]);
  return rideId && state.id === rideId ? state.progress : 0;
}
