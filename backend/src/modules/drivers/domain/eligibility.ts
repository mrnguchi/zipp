import { BusinessError } from '../../../shared/errors/business-error.js';
import type {
  DriverRecord,
  DocumentRecord,
} from '../contracts/driver-contracts.js';
export const DOCUMENT_KINDS = [
  'IDENTITY',
  'LICENSE',
  'VEHICLE_REGISTRATION',
  'INSURANCE',
] as const;
export function requiredDocuments(
  documents: readonly DocumentRecord[],
  state: 'STORED' | 'APPROVED',
  now = new Date(),
) {
  return DOCUMENT_KINDS.every((kind) =>
    documents.some(
      (doc) =>
        doc.kind === kind &&
        doc.status === state &&
        doc.documentExpiresAt > now,
    ),
  );
}
export function assertApproved(
  driver: DriverRecord,
  documents: readonly DocumentRecord[],
  now = new Date(),
): void {
  if (
    driver.status !== 'APPROVED' ||
    !driver.vehicle ||
    !driver.approvedClasses.length ||
    !requiredDocuments(documents, 'APPROVED', now)
  )
    throw new BusinessError(
      'DRIVER_NOT_ELIGIBLE',
      'Current driver approval and unexpired documents are required',
    );
}
export function freshPresence(driver: DriverRecord, now = new Date()): boolean {
  const p = driver.presence;
  return (
    !!p?.online &&
    p.sessionExpiresAt > now &&
    p.receivedAt !== null &&
    p.capturedAt !== null &&
    p.receivedAt.getTime() <= now.getTime() &&
    p.capturedAt.getTime() <= now.getTime() + 5000 &&
    now.getTime() - p.receivedAt.getTime() <= 15000 &&
    now.getTime() - p.capturedAt.getTime() <= 15000
  );
}
