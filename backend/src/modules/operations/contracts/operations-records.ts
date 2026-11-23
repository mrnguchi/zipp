import type {
  CaseStatus,
  ReasonCode,
  SubjectType,
  Receipt,
} from './operations.schemas.js';
export interface CaseRecord {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  reasonCode: ReasonCode;
  description: string;
  status: CaseStatus;
  version: number;
  openedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface CaseEvent {
  id: string;
  caseId: string;
  version: number;
  action: 'OPEN' | 'REVIEW' | 'ACCOUNT_STATUS';
  status: CaseStatus;
  reasonCode: ReasonCode;
  actorUserId: string;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | null;
  createdAt: Date;
}
export interface CaseCommand extends Receipt {
  fingerprint: string;
}
export const caseProjection = (r: CaseRecord) => ({
  id: r.id,
  subjectType: r.subjectType,
  subjectId: r.subjectId,
  reasonCode: r.reasonCode,
  description: r.description,
  status: r.status,
  version: r.version,
  openedByUserId: r.openedByUserId,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
