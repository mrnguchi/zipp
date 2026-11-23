export interface ConnectionLease {
  readonly id: string;
  readonly actorKey: string;
  readonly ipKey: string;
}
/** Cross-instance admission only. Losing a connection lease never changes a business job. */
export abstract class ConnectionLeases {
  abstract acquire(actorKey: string, ipKey: string): Promise<ConnectionLease>;
  abstract renew(lease: ConnectionLease): Promise<boolean>;
  abstract release(lease: ConnectionLease): Promise<void>;
}
