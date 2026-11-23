import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { IdentityFacade } from '../../identity/identity.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { DriverRepository } from './driver.repository.js';
import { DocumentStorage } from './document-storage.port.js';
import { DriversConfig } from '../drivers.config.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import type { DocumentInput } from '../contracts/driver.schemas.js';
import type { DocumentRecord } from '../contracts/driver-contracts.js';

function matchesMagic(type: string, bytes: Uint8Array): boolean {
  if (type === 'application/pdf')
    return Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-';
  if (type === 'image/jpeg')
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return (
    type === 'image/png' &&
    Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  );
}
@Injectable()
export class DriverDocumentService {
  constructor(
    @Inject(DriverRepository) private readonly repository: DriverRepository,
    @Inject(DocumentStorage) private readonly storage: DocumentStorage,
    @Inject(DriversConfig) private readonly config: DriversConfig,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}
  async intent(actor: Actor, input: DocumentInput) {
    this.config.assertUploads();
    const expires = Date.parse(input.documentExpiresAt);
    if (expires <= Date.now() || expires > Date.now() + 10 * 366 * 86400_000)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Document expiry must be future and within ten years',
      );
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      const driver = await this.repository.findOwner(actor.userId, context);
      if (!driver || driver.status !== 'DRAFT')
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Save an editable driver application first',
        );
      await this.repository.lock(context, driver.id);
      const documents = await this.repository.documents(
        driver.id,
        driver.revision,
        context,
      );
      if (documents.length >= 20)
        throw new BusinessError(
          'DOCUMENT_LIMIT_REACHED',
          'Document limit reached for this revision',
        );
      const doc = await this.repository.createDocument(context, driver, input);
      await this.audit.record(
        context,
        actor.userId,
        'drivers.document_intent_created',
      );
      return {
        id: doc.id,
        uploadExpiresAt: doc.uploadExpiresAt,
        uploadPath: `/api/v1/drivers/me/documents/${doc.id}/content`,
      };
    });
  }
  async uploadTarget(actor: Actor, id: string): Promise<DocumentRecord> {
    this.config.assertUploads();
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      const doc = await this.repository.document(id, context);
      const driver = doc
        ? await this.repository.find(doc.driverApplicationId, context)
        : null;
      if (!doc || !driver || driver.ownerUserId !== actor.userId)
        throw new BusinessError('NOT_FOUND', 'Document not found');
      await this.repository.lock(context, driver.id);
      if (
        driver.status !== 'DRAFT' ||
        doc.applicationRevision !== driver.revision ||
        !['PENDING_UPLOAD', 'STORED'].includes(doc.status) ||
        doc.uploadExpiresAt <= new Date()
      )
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Upload is no longer available',
        );
      return doc;
    });
  }
  async upload(actor: Actor, id: string, bytes: Uint8Array) {
    const doc = await this.uploadTarget(actor, id);
    if (
      bytes.byteLength !== doc.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== doc.contentSha256 ||
      !matchesMagic(doc.contentType, bytes)
    )
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Document size, digest or content type does not match',
      );
    // Storage is outside the transaction. A private orphan is safer than pretending commit succeeded.
    await this.storage.write(doc.objectKey, bytes);
    await this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      await this.repository.lock(context, doc.driverApplicationId);
      const driver = await this.repository.find(
        doc.driverApplicationId,
        context,
      );
      const current = await this.repository.document(id, context);
      if (
        !driver ||
        driver.ownerUserId !== actor.userId ||
        driver.status !== 'DRAFT' ||
        driver.revision !== doc.applicationRevision ||
        !current ||
        !['PENDING_UPLOAD', 'STORED'].includes(current.status) ||
        current.uploadExpiresAt <= new Date()
      )
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Application changed while uploading',
        );
      await this.repository.storeDocument(context, id);
      await this.audit.record(context, actor.userId, 'drivers.document_stored');
    });
  }
  async download(actor: Actor, id: string) {
    this.config.assertUploads();
    const doc = await this.transactions.run(async (context) => {
      const current = await this.identity.authorize(context, actor);
      const record = await this.repository.document(id, context);
      const driver = record
        ? await this.repository.find(record.driverApplicationId, context)
        : null;
      if (!record || !driver || record.status === 'PENDING_UPLOAD')
        throw new BusinessError('NOT_FOUND', 'Document not found');
      if (
        driver.ownerUserId !== actor.userId &&
        !current.roles.includes('ADMIN')
      )
        throw new BusinessError('NOT_FOUND', 'Document not found');
      if (driver.ownerUserId !== actor.userId)
        await this.identity.authorize(context, current, ['ADMIN'], true);
      await this.audit.record(
        context,
        actor.userId,
        'drivers.document_accessed',
        driver.ownerUserId,
      );
      return record;
    });
    const bytes = await this.storage.read(doc.objectKey);
    if (
      bytes.byteLength !== doc.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== doc.contentSha256
    )
      throw new BusinessError(
        'DOCUMENT_INTEGRITY_ERROR',
        'Document requires storage review',
      );
    return { bytes, contentType: doc.contentType };
  }
}
