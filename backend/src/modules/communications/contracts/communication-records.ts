export interface ThreadRecord {
  id: string;
  kind: 'JOB' | 'SUPPORT';
  creatorUserId: string;
  jobId: string | null;
  jobType: 'RIDE' | 'DELIVERY' | null;
  subject: string | null;
  category: string | null;
  status: 'OPEN' | 'RESOLVED';
  version: number;
  lastSequence: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface MessageRecord {
  id: string;
  threadId: string;
  sequence: number;
  authorUserId: string;
  body: string;
  createdAt: Date;
}
export interface CommandReceipt {
  threadId: string;
  messageId: string | null;
  sequence: number | null;
  version: number;
}
export interface CommandRecord extends CommandReceipt {
  fingerprint: string;
}
export const threadView = (t: ThreadRecord, writable: boolean) => ({
  id: t.id,
  kind: t.kind,
  job: t.jobId && t.jobType ? { jobType: t.jobType, jobId: t.jobId } : null,
  subject: t.subject,
  category: t.category,
  status: t.status,
  version: t.version,
  lastSequence: t.lastSequence,
  writable,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});
