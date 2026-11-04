import * as Location from 'expo-location';

export function usableLocation(location: Location.LocationObject, startedAt: number, now = Date.now()) {
  const {latitude, longitude, accuracy} = location.coords;
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    && (accuracy === null || Number.isFinite(accuracy) && accuracy >= 0)
    && location.timestamp >= startedAt - 10000 && location.timestamp <= now + 5000 && now - location.timestamp <= 30000;
}

// Prefer a precise fix, but use the best fresh device reading after a short
// acquisition window. A precision target must not prevent choosing a pickup.
export function getPreciseLocation(signal: AbortSignal): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let subscription: Location.LocationSubscription | undefined;
    let finished = false;
    let best: Location.LocationObject | undefined;
    let acquisitionComplete = false;
    const finish = (location?: Location.LocationObject, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(quickTimer);
      signal.removeEventListener('abort', abort);
      subscription?.remove();
      if (location) resolve(location); else reject(error || new Error('No precise GPS fix'));
    };
    const abort = () => finish(undefined, new Error('Location canceled'));
    const timer = setTimeout(() => finish(best, new Error('Device location unavailable')), 20000);
    const quickTimer = setTimeout(() => {
      acquisitionComplete = true;
      if (best) finish(best);
    }, 6000);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, {once:true});
    const accept = (location: Location.LocationObject) => {
      if (finished || !usableLocation(location, startedAt)) return;
      if (!best || (location.coords.accuracy ?? Infinity) < (best.coords.accuracy ?? Infinity)) best = location;
      if (acquisitionComplete || (location.coords.accuracy !== null && location.coords.accuracy <= 30)) finish(best);
    };
    // Some devices deliver the one-shot fix before their subscription starts.
    void Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Highest}).then(accept).catch(() => {});
    void Location.watchPositionAsync({accuracy:Location.Accuracy.BestForNavigation, timeInterval:1000, distanceInterval:0}, accept).then(value => {
      if (finished) value.remove(); else subscription = value;
    }).catch(() => { /* The one-shot request can still supply the fix. */ });
  });
}
