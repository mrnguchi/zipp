export type RidePhase = 'arriving' | 'arrived' | 'in_progress' | 'processing_payment' | 'completed' | 'rated' | 'canceled';
export type RideSession = { id: string; phase: RidePhase; pin: string; fare: number; pinVerified: boolean; rating?: number; feedback?: string; paid: boolean };
export type RideEvent =
  | { type: 'confirmed'; rideId: string; pin: string; fare: number }
  | { type: 'arrived' | 'pin_verified' | 'started' | 'canceled'; rideId: string }
  | { type: 'completed'; rideId: string; fare: number }
  | { type: 'payment_received' | 'payment_failed'; rideId: string }
  | { type: 'rated'; rideId: string; rating: number; feedback: string };

export function transitionRide(current: RideSession | null, event: RideEvent): RideSession | null {
  if (event.type === 'confirmed') {
    if (current && !['rated', 'canceled'].includes(current.phase)) return current;
    if (!/^\d{4}$/.test(event.pin) || !Number.isFinite(event.fare) || event.fare < 0) return current;
    return { id: event.rideId, phase: 'arriving', pin: event.pin, fare: event.fare, pinVerified: false, paid: false };
  }
  if (!current || current.id !== event.rideId) return current;
  if (event.type === 'arrived' && current.phase === 'arriving') return { ...current, phase: 'arrived' };
  if (event.type === 'pin_verified' && current.phase === 'arrived' && !current.pinVerified) return { ...current, pinVerified: true };
  if (event.type === 'started' && current.phase === 'arrived' && current.pinVerified) return { ...current, phase: 'in_progress' };
  if (event.type === 'completed' && current.phase === 'in_progress' && Number.isFinite(event.fare) && event.fare >= 0) return { ...current, phase: 'processing_payment', fare: event.fare };
  if (event.type === 'payment_received' && ['processing_payment', 'completed'].includes(current.phase) && !current.paid) return { ...current, phase: 'completed', paid: true };
  if (event.type === 'payment_failed' && current.phase === 'processing_payment') return { ...current, phase: 'completed', paid: false };
  if (event.type === 'canceled' && ['arriving', 'arrived'].includes(current.phase)) return { ...current, phase: 'canceled', pin: '' };
  if (event.type === 'rated' && current.phase === 'completed' && current.paid && Number.isInteger(event.rating) && event.rating >= 1 && event.rating <= 5) return { ...current, phase: 'rated', rating: event.rating, feedback: event.feedback.trim() };
  return current;
}

// Adapter boundary for authenticated server/push events. Do not trust arbitrary
// remote payloads; validate ownership and PIN/payment results on the server.
const listeners = new Set<(event: RideEvent) => void>();
export function publishRideEvent(event: RideEvent) { listeners.forEach(listener => listener(event)); }
export function subscribeRideEvents(listener: (event: RideEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
