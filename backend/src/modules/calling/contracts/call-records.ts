import type { CallStatus } from './call.schemas.js';
export interface CallRecord {
  id: string;
  jobId: string;
  jobType: 'RIDE' | 'DELIVERY';
  callerUserId: string;
  calleeUserId: string;
  callerSessionId: string;
  callerDeviceId: string;
  callerDeviceGeneration: number;
  calleeSessionId: string | null;
  calleeDeviceId: string | null;
  calleeDeviceGeneration: number | null;
  status: CallStatus;
  version: number;
  signalEpoch: number;
  ringExpiresAt: Date;
  connectExpiresAt: Date | null;
  acceptedAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
  lastCheckedAt: Date;
  createdAt: Date;
}
export type CallOperation = 'CREATE' | 'ACCEPT' | 'REJECT' | 'END';
export type CallSide = 'CALLER' | 'CALLEE';
export const callView = (r: CallRecord, actorId: string) => ({
  id: r.id,
  status: r.status,
  version: r.version,
  role: actorId === r.callerUserId ? ('CALLER' as const) : ('CALLEE' as const),
  signalEpoch: r.signalEpoch,
  ringExpiresAt: r.ringExpiresAt.toISOString(),
  connectExpiresAt: r.connectExpiresAt?.toISOString() ?? null,
  acceptedAt: r.acceptedAt?.toISOString() ?? null,
  endedAt: r.endedAt?.toISOString() ?? null,
  endReason: r.endReason,
  createdAt: r.createdAt.toISOString(),
  audioAvailable: false as const,
});
export interface SignalGrant {
  callId: string;
  epoch: number;
  version: number;
  side: CallSide;
  expiresAt: Date;
}
