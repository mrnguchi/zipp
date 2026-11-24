import type { CallSide } from '../contracts/call-records.js';
import type { RelayCredentials } from '../contracts/call.schemas.js';

export interface RelayGrant {
  callId: string;
  version: number;
  epoch: number;
  side: CallSide;
  // This is an internal scope only, never a log/event/username payload.
  scope: readonly (string | number)[];
  expiresAt: Date;
  serverTime: Date;
}
export abstract class CallRelay {
  abstract mint(grant: RelayGrant): RelayCredentials;
}
