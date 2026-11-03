export type ActivityKind = 'ride' | 'delivery';
export type ActivityStatus = 'active' | 'completed' | 'canceled';
export type ActivityRecord = {
  id: string; kind: ActivityKind; title: string; status: ActivityStatus; statusLabel: string;
  pickup: string; destination: string; createdAt: number; updatedAt: number;
  fare: number; charged: number; payment: 'reserved' | 'paid' | 'pending' | 'released';
  driver: string; driverRating?: number; driverTrips?: number; driverPhone?: string; detail?: string; recipient?: string; perspective?: 'receiving' | 'sending'; rating?: number;
};
export type ActivityUpdate = Omit<ActivityRecord, 'createdAt' | 'updatedAt'>;
export type RideActivityMeta = { pickup: string; destination: string; title: string; detail?: string };
export function rideActivity(session: RideSession, meta: RideActivityMeta): ActivityUpdate {
  const canceled = session.phase === 'canceled', ended = session.phase === 'completed' || session.phase === 'rated';
  const statusLabel = canceled ? 'Canceled' : ended ? session.paid ? 'Completed' : 'Payment pending' : session.phase === 'arriving' ? 'Driver arriving' : session.phase === 'arrived' ? 'Driver arrived' : session.phase === 'in_progress' ? 'In progress' : 'Processing payment';
  return { id: session.id, kind: 'ride', ...meta, status: canceled ? 'canceled' : ended ? 'completed' : 'active', statusLabel, fare: session.fare, charged: canceled ? Math.round(session.fare * 0.25) : session.paid ? session.fare : 0, payment: canceled || session.paid ? 'paid' : ended ? 'pending' : 'reserved', driver: 'Alex', rating: session.rating };
}
export function deliveryActivity(session: DeliverySession, draft: DeliveryDraft): ActivityUpdate {
  const canceled = session.phase === 'canceled', ended = session.phase === 'delivered' || session.phase === 'rated';
  const statusLabel = canceled ? 'Canceled' : ended ? session.paid ? 'Delivered' : 'Payment pending' : session.phase === 'courier_arriving' ? 'Courier arriving' : session.phase === 'at_pickup' ? 'At pickup' : session.phase === 'in_transit' ? 'On the way' : session.phase === 'at_dropoff' ? 'At destination' : 'Processing payment';
  return { id: session.id, kind: 'delivery', title: `${draft.mode === 'express' ? 'Express' : 'Standard'} delivery`, pickup: draft.pickup?.label ?? '', destination: draft.dropoff?.label ?? '', status: canceled ? 'canceled' : ended ? 'completed' : 'active', statusLabel, fare: session.fare, charged: session.paid ? session.fare : 0, payment: canceled ? 'released' : session.paid ? 'paid' : ended ? 'pending' : 'reserved', driver: 'Michael', detail: `${draft.description} · ${draft.size} package`, recipient: draft.recipientName, perspective: session.perspective, rating: session.rating };
}
export function upsertActivity(records: ActivityRecord[], update: ActivityUpdate, now: number): ActivityRecord[] {
  const previous = records.find(item => item.id === update.id);
  const record = { ...update, createdAt: previous?.createdAt ?? now, updatedAt: now };
  return [record, ...records.filter(item => item.id !== update.id)].sort((a, b) => b.createdAt - a.createdAt);
}
export function filterActivities(records: ActivityRecord[], kind: 'all' | ActivityKind, status: 'all' | ActivityStatus, query: string): ActivityRecord[] {
  const term = query.trim().toLowerCase();
  return records.filter(item => (kind === 'all' || item.kind === kind) && (status === 'all' || item.status === status) && (!term || [item.title, item.pickup, item.destination, item.driver, item.detail, item.recipient].filter(Boolean).join(' ').toLowerCase().includes(term)));
}
const dayKey = (time: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
export function groupActivities(records: ActivityRecord[], now: number) {
  const groups: { title: string; data: ActivityRecord[] }[] = [];
  for (const item of [...records].sort((a, b) => b.createdAt - a.createdAt)) {
    const title = item.status === 'active' ? 'In progress' : dayKey(item.createdAt) === dayKey(now) ? 'Today' : dayKey(item.createdAt) === dayKey(now - 86400000) ? 'Yesterday' : 'Earlier';
    const group = groups.find(group => group.title === title);
    if (group) group.data.push(item); else groups.push({ title, data: [item] });
  }
  return groups.sort((a, b) => ['In progress', 'Today', 'Yesterday', 'Earlier'].indexOf(a.title) - ['In progress', 'Today', 'Yesterday', 'Earlier'].indexOf(b.title));
}
export function sampleActivities(now: number): ActivityRecord[] {
  return [
    { id: 'sample-ride-1', kind: 'ride', title: 'Everyday ride', status: 'completed', statusLabel: 'Completed', pickup: 'Molyko, Buea', destination: 'Mile 17, Buea', createdAt: now - 3600000, updatedAt: now - 3200000, fare: 1500, charged: 1500, payment: 'paid', driver: 'Alex', detail: 'Toyota Yaris · SW 681 BS', rating: 5 },
    { id: 'sample-delivery-1', kind: 'delivery', title: 'Express delivery', status: 'completed', statusLabel: 'Delivered', pickup: 'Great Soppo, Buea', destination: 'Molyko, Buea', createdAt: now - 86400000, updatedAt: now - 85000000, fare: 2250, charged: 2250, payment: 'paid', driver: 'Michael', detail: 'Documents · Small package', perspective: 'receiving', recipient: 'Nguchi', rating: 4 },
    { id: 'sample-ride-2', kind: 'ride', title: 'Comfort ride', status: 'canceled', statusLabel: 'Canceled', pickup: 'Buea Town', destination: 'University of Buea', createdAt: now - 172800000, updatedAt: now - 172000000, fare: 2000, charged: 500, payment: 'paid', driver: 'Alex', detail: 'Lexus RX · SW 681 BS' },
  ];
}
import type { RideSession } from './rideEvents';
import type { DeliveryDraft, DeliverySession } from './deliveryFlow';
