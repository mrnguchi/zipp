import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useNotifications } from '../contexts/NotificationContext';
import { deliveryProgressNotice, subscribeDeliveryEvents, transitionDelivery } from '../services/deliveryFlow';
import type { DeliveryEvent, DeliverySession } from '../services/deliveryFlow';
import { formatXaf } from '../utils/formatCurrency';
import { useActivity } from '../contexts/ActivityContext';
import { deliveryActivity } from '../services/activityHistory';
import type { DeliveryDraft } from '../services/deliveryFlow';
export function useDeliveryLifecycle(draft?: DeliveryDraft) {
  const [session, setSession] = useState<DeliverySession | null>(null);
  const latest = useRef(session);
  const { reserve, settle } = useWallet();
  const { notify } = useNotifications();
  const { upsert } = useActivity();
  useEffect(() => { if (session && draft) upsert(deliveryActivity(session, draft)); }, [session, draft, upsert]);
  const applyEvent = useCallback((event: DeliveryEvent) => {
    const next = transitionDelivery(latest.current, event);
    if (!next || next === latest.current) return false;
    if (event.type === 'requested' && !reserve(next.id, next.fare)) return false;
    if (event.type === 'canceled' && !settle(next.id, 0)) return false;
    if (event.type === 'payment_received' && !settle(next.id, next.fare)) return false;
    latest.current = next; setSession(next);
    const copy = deliveryProgressNotice(event.type, next.perspective) ?? (event.type === 'payment_received' ? ['Delivery complete', `${formatXaf(next.fare)} paid from your Zipp Wallet. Your receipt is ready.`]
      : event.type === 'payment_failed' ? ['Delivery payment pending', 'Open the delivery summary to finish your wallet payment.']
      : event.type === 'canceled' ? ['Delivery canceled', 'Your reserved delivery funds are available again.'] : null);
    if (copy) notify({ id: `${next.id}:${event.type}`, title: copy[0], body: copy[1], kind: 'ride' });
    return true;
  }, [reserve, settle, notify]);
  useEffect(() => subscribeDeliveryEvents(applyEvent), [applyEvent]);
  useEffect(() => {
    if (!__DEV__ || session?.phase !== 'processing_payment') return;
    const id = session.id;
    const timer = setTimeout(() => { if (!applyEvent({ type: 'payment_received', deliveryId: id })) applyEvent({ type: 'payment_failed', deliveryId: id }); }, 3000);
    return () => clearTimeout(timer);
  }, [session?.id, session?.phase, applyEvent]);
  return { session, applyEvent };
}
