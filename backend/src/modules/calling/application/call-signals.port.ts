import type { SignalGrant } from '../contracts/call-records.js';
import type { SignalPacket } from '../contracts/call.schemas.js';
export abstract class CallSignals {
  abstract send(
    grant: SignalGrant,
    packet: SignalPacket,
  ): Promise<{ acceptedSequence: number }>;
  abstract read(
    grant: SignalGrant,
    after: number,
  ): Promise<{
    items: SignalPacket[];
    lastSequence: number;
    resyncRequired: boolean;
  }>;
}
