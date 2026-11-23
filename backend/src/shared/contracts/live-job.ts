/** Minimal participant projection; never reuse a private booking record as a socket payload. */
export interface LivePosition {
  readonly latitude: number;
  readonly longitude: number;
  readonly receivedAt: Date;
  readonly stale: boolean;
}
export interface LiveJobProjection {
  readonly jobType: 'RIDE' | 'DELIVERY';
  readonly jobId: string;
  readonly version: number;
  readonly status: string;
  readonly custody: string | null;
  readonly terminal: boolean;
  readonly position: LivePosition | null;
}
