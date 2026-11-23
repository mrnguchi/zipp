import type { CallRecord, CallSide } from '../contracts/call-records.js';
import type { CallStatus, SignalPacket } from '../contracts/call.schemas.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
export const callTerminal = (status: CallStatus) =>
  status !== 'RINGING' && status !== 'CONNECTING';
export function dueCall(
  r: CallRecord,
  now: Date,
): { status: CallStatus; reason: string } | null {
  if (r.status === 'RINGING' && r.ringExpiresAt <= now)
    return { status: 'MISSED', reason: 'RING_TIMEOUT' };
  if (
    r.status === 'CONNECTING' &&
    r.connectExpiresAt &&
    r.connectExpiresAt <= now
  )
    return { status: 'FAILED', reason: 'CONNECT_TIMEOUT' };
  return null;
}
export function assertCallVersion(r: CallRecord, expected: number) {
  if (r.version !== expected)
    throw new BusinessError('CALL_VERSION_CONFLICT', 'Reload the current call');
  if (r.version >= 1000000)
    throw new BusinessError('CALL_VERSION_LIMIT', 'Call version limit reached');
}
export function assertSignalOrder(side: CallSide, p: SignalPacket) {
  const value = p.payload.type === 'ICE' ? p.payload.candidate : p.payload.sdp;
  if (
    new TextEncoder().encode(value).length >
    (p.payload.type === 'ICE' ? 1024 : 8192)
  )
    throw new BusinessError('VALIDATION_ERROR', 'Signal exceeds byte limit');
  const first = side === 'CALLER' ? 'OFFER' : 'ANSWER';
  if (
    (p.sequence === 1 && p.payload.type !== first) ||
    (p.sequence > 1 && p.payload.type !== 'ICE')
  )
    throw new BusinessError(
      'SIGNAL_ORDER_INVALID',
      'Invalid negotiation packet order',
    );
}
