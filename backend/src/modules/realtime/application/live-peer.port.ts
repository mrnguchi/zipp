import type { LiveSnapshot } from '../contracts/realtime.schemas.js';
export interface LiveFailure {
  schemaVersion: 1;
  code:
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'INVALID_SUBSCRIPTION'
    | 'REALTIME_UNAVAILABLE'
    | 'REALTIME_LIMIT'
    | 'SLOW_CONSUMER'
    | 'UNSUPPORTED_COMMAND';
  retryAfterSeconds: number;
}
/** Thin transport capability. No provider error or incoming credentials are serialized. */
export interface LivePeer {
  readonly id: string;
  isOpen(): boolean;
  canSend(): boolean;
  send(snapshot: LiveSnapshot): void;
  close(failure?: LiveFailure): void;
}
