import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { subscribeRideEvents, transitionRide } from '../services/rideEvents';
import type { RideEvent, RideSession } from '../services/rideEvents';
import { formatXaf } from '../utils/formatCurrency';
import { useWallet } from '../contexts/WalletContext';
import { useActivity } from '../contexts/ActivityContext';
import { rideActivity } from '../services/activityHistory';
import type { RideActivityMeta } from '../services/activityHistory';

export function useRideLifecycle(meta?: RideActivityMeta) {
  const [session, setSession] = useState<RideSession | null>(null);
  const latest = useRef(session);
  const { notify } = useNotifications();
  const { reserve, settle } = useWallet();
  const { upsert } = useActivity();
  useEffect(() => { if (session && meta) upsert(rideActivity(session, meta)); }, [session, meta?.pickup, meta?.destination, meta?.title, meta?.detail, upsert]);
  const applyEvent = useCallback((event: RideEvent) => {
    let next = transitionRide(latest.current, event);
    if (!next || next === latest.current) return false;
    if (event.type === 'confirmed' && !reserve(next.id, next.fare)) return false;
    if (event.type === 'canceled' && !settle(next.id, Math.round(next.fare * 0.25))) return false;
    if (event.type === 'payment_received' && !settle(next.id, next.fare)) return false;
    latest.current = next; setSession(next);
    const copy = event.type === 'arrived' ? ['Your driver has arrived', 'Check the car and number plate, then share your trip PIN once you’re inside.']
      : event.type === 'started' ? ['Your ride has started', 'You’re on your way. Follow your journey and share your trip with someone you trust.']
      : event.type === 'payment_failed' ? ['Payment needs attention', 'Your ride is complete. Open the trip summary to finish payment.']
      : event.type === 'canceled' ? ['Ride canceled', `${formatXaf(Math.round(next.fare * 0.25))} was charged to your wallet. The remaining reserved balance is available again.`]
      : event.type === 'payment_received' ? ['Your receipt is ready', `${formatXaf(next.fare)} was paid from your Zipp Wallet. Thanks for riding with Zipp.`] : null;
    if (copy) notify({ id: `${next.id}:${event.type}`, title: copy[0], body: copy[1], kind: event.type === 'payment_received' ? 'wallet' : 'ride' });
    return true;
  }, [notify, reserve, settle]);
  useEffect(() => subscribeRideEvents(applyEvent), [applyEvent]);
  useEffect(() => {
    if (!__DEV__ || session?.phase !== 'processing_payment') return;
    const rideId = session.id;
    const timer = setTimeout(() => {
      if (!applyEvent({ type: 'payment_received', rideId })) applyEvent({ type: 'payment_failed', rideId });
    }, 3000);
    return () => clearTimeout(timer);
  }, [session?.id, session?.phase, applyEvent]);
  return { session, applyEvent };
}
