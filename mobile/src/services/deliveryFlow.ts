import type { MapCoordinate } from '../components/maps/mapGeometry';
export type DeliveryStop = { label: string; coordinate: MapCoordinate };
export type PackagePhoto = { uri: string; width: number; height: number; mimeType?: string; fileName?: string };
export type DeliveryPerspective = 'receiving' | 'sending';
export type DeliveryDraft = { perspective: DeliveryPerspective; pickup?: DeliveryStop; dropoff?: DeliveryStop; mode: 'standard' | 'express'; senderName: string; senderPhone: string; recipientName: string; recipientPhone: string; description: string; photo?: PackagePhoto; size: 'small' | 'medium' | 'large' };
export type DeliveryPhase = 'courier_arriving' | 'at_pickup' | 'in_transit' | 'at_dropoff' | 'processing_payment' | 'delivered' | 'rated' | 'canceled';
export type DeliverySession = { id: string; perspective: DeliveryPerspective; phase: DeliveryPhase; fare: number; pin: string; paid: boolean; courierPhone?: string; rating?: number; feedback?: string };
export type DeliveryEvent =
  | { type: 'requested'; deliveryId: string; fare: number; pin: string; courierPhone?: string; perspective?: DeliveryPerspective }
  | { type: 'courier_arrived' | 'collected' | 'destination_arrived' | 'handover_verified' | 'payment_received' | 'payment_failed' | 'canceled'; deliveryId: string }
  | { type: 'rated'; deliveryId: string; rating: number; feedback: string };
export function validDeliveryPhone(value: string) { return /^\+?\d{9,15}$/.test(value.replace(/[\s()-]/g, '')); }
export function createDeliveryDraft(name: string, phone: string): DeliveryDraft {
  return { perspective: 'receiving', mode: 'standard', senderName: '', senderPhone: '', recipientName: name, recipientPhone: phone, description: '', size: 'small' };
}
export function switchDeliveryPerspective(draft: DeliveryDraft, perspective: DeliveryPerspective): DeliveryDraft {
  if (draft.perspective === perspective) return draft;
  // Keep the booker and the other person on the correct ends of the journey,
  // preserving entered contacts/locations when switching back and forth.
  const relabel = (stop: DeliveryStop | undefined, title: string) => stop && /^(Pickup|Drop-off) ·/.test(stop.label) ? { ...stop, label: stop.label.replace(/^(Pickup|Drop-off)/, title) } : stop;
  return { ...draft, perspective, senderName: draft.recipientName, senderPhone: draft.recipientPhone, recipientName: draft.senderName, recipientPhone: draft.senderPhone, pickup: relabel(draft.dropoff, 'Pickup'), dropoff: relabel(draft.pickup, 'Drop-off') };
}
export function deliveryProgressNotice(type: DeliveryEvent['type'], perspective: DeliveryPerspective): [string, string] | undefined {
  const receiving = perspective === 'receiving';
  if (type === 'courier_arrived') return receiving ? ['Courier at pickup', 'Your courier has reached the sender to collect your package.'] : ['Your courier is here', 'Have your package ready at the pickup location.'];
  if (type === 'collected') return ['Package collected', receiving ? 'Your package is on its way to you.' : 'Your package is on its way to the recipient.'];
  if (type === 'destination_arrived') return receiving ? ['Your delivery has arrived', 'Receive your package, then share your handover PIN with the courier.'] : ['Courier at the recipient', 'Your recipient can now share the handover PIN after receiving the package.'];
}
export function validateDelivery(draft: DeliveryDraft, step: number): string | undefined {
  if (!draft.pickup || !draft.dropoff) return 'Choose pickup and drop-off locations first.';
  const a = draft.pickup.coordinate, b = draft.dropoff.coordinate;
  if (![a, b].every(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180)) return 'Choose valid locations on the map.';
  if (Math.abs(a.latitude - b.latitude) < 0.00002 && Math.abs(a.longitude - b.longitude) < 0.00002) return 'Choose a different drop-off location.';
  if (step >= 1) {
    const receiving = draft.perspective === 'receiving';
    if (!(receiving ? draft.recipientName : draft.senderName).trim() || !validDeliveryPhone(receiving ? draft.recipientPhone : draft.senderPhone)) return 'Add your name and a valid phone number.';
    if (!(receiving ? draft.senderName : draft.recipientName).trim() || !validDeliveryPhone(receiving ? draft.senderPhone : draft.recipientPhone)) return receiving ? 'Add the sender’s name and a valid phone number.' : 'Add the recipient’s name and a valid phone number.';
    if (!draft.description.trim()) return 'Tell your courier what the package contains.';
  }
}
// Development pricing fixture. Backend quotes must supply fare and expiration in production.
export function deliveryFare(distanceMeters: number, mode: DeliveryDraft['mode']) {
  const base = 1000 + Math.ceil(Math.max(0, distanceMeters) / 1000) * 150;
  return Math.round(base * (mode === 'express' ? 1.5 : 1));
}
export function transitionDelivery(current: DeliverySession | null, event: DeliveryEvent): DeliverySession | null {
  if (event.type === 'requested') {
    if (current && !['rated', 'canceled'].includes(current.phase)) return current;
    if (!Number.isSafeInteger(event.fare) || event.fare <= 0 || !/^\d{4}$/.test(event.pin)) return current;
    return { id: event.deliveryId, perspective: event.perspective === 'sending' ? 'sending' : 'receiving', phase: 'courier_arriving', fare: event.fare, pin: event.pin, paid: false, courierPhone: event.courierPhone && validDeliveryPhone(event.courierPhone) ? event.courierPhone : undefined };
  }
  if (!current || current.id !== event.deliveryId) return current;
  if (event.type === 'courier_arrived' && current.phase === 'courier_arriving') return { ...current, phase: 'at_pickup' };
  if (event.type === 'collected' && current.phase === 'at_pickup') return { ...current, phase: 'in_transit' };
  if (event.type === 'destination_arrived' && current.phase === 'in_transit') return { ...current, phase: 'at_dropoff' };
  if (event.type === 'handover_verified' && current.phase === 'at_dropoff') return { ...current, phase: 'processing_payment', pin: '' };
  if (event.type === 'payment_received' && ['processing_payment', 'delivered'].includes(current.phase) && !current.paid) return { ...current, phase: 'delivered', paid: true };
  if (event.type === 'payment_failed' && current.phase === 'processing_payment') return { ...current, phase: 'delivered', paid: false };
  if (event.type === 'canceled' && ['courier_arriving', 'at_pickup'].includes(current.phase)) return { ...current, phase: 'canceled', pin: '' };
  if (event.type === 'rated' && current.phase === 'delivered' && current.paid && Number.isInteger(event.rating) && event.rating >= 1 && event.rating <= 5) return { ...current, phase: 'rated', rating: event.rating, feedback: event.feedback.trim() };
  return current;
}
const listeners = new Set<(event: DeliveryEvent) => void>();
export function publishDeliveryEvent(event: DeliveryEvent) { listeners.forEach(listener => listener(event)); }
export function subscribeDeliveryEvents(listener: (event: DeliveryEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
