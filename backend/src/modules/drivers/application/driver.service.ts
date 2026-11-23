import { Inject, Injectable } from '@nestjs/common';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { DriverRepository } from './driver.repository.js';
import type { DriverRecord } from '../contracts/driver-contracts.js';
import type {
  VehicleInput,
  ReviewInput,
  LocationInput,
} from '../contracts/driver.schemas.js';
import {
  DOCUMENT_KINDS,
  assertApproved,
  requiredDocuments,
  freshPresence,
} from '../domain/eligibility.js';
import { assertPlausibleLocation } from '../domain/location.js';

@Injectable()
export class DriverService {
  constructor(
    @Inject(DriverRepository) private readonly repository: DriverRepository,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
  ) {}
  async vehicle(actor: Actor, input: VehicleInput) {
    if (input.manufactureYear > new Date().getUTCFullYear() + 1)
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Vehicle manufacture year is in the future',
      );
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      const driver = await this.repository.ensure(context, actor.userId);
      await this.repository.lock(context, driver.id);
      await this.jobs.assertDriverFree(context, actor.userId);
      if (['SUBMITTED', 'SUSPENDED'].includes(driver.status))
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Application cannot be edited in its current state',
        );
      if (driver.status !== 'DRAFT') {
        if (driver.revision >= 20)
          throw new BusinessError(
            'INVALID_TRANSITION',
            'Application revision limit reached; contact support',
          );
        await this.repository.change(context, driver.id, {
          status: 'DRAFT',
          revision: driver.revision + 1,
          approvedClasses: [],
          submittedAt: null,
          reviewedAt: null,
        });
        await this.identity.setDriverRole(context, actor.userId, false);
        await this.repository.setPresence(
          context,
          driver.id,
          actor.sessionId,
          false,
        );
      }
      await this.repository.saveVehicle(context, driver.id, input);
      await this.audit.record(context, actor.userId, 'drivers.vehicle_saved');
      return this.repository.find(driver.id, context);
    });
  }
  async submit(actor: Actor) {
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      const driver = await this.repository.findOwner(actor.userId, context);
      if (!driver)
        throw new BusinessError('NOT_FOUND', 'Driver application not found');
      await this.repository.lock(context, driver.id);
      if (driver.status === 'SUBMITTED') return driver;
      if (driver.status !== 'DRAFT' || !driver.vehicle)
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Complete an editable application and vehicle first',
        );
      const documents = await this.repository.documents(
        driver.id,
        driver.revision,
        context,
      );
      if (!requiredDocuments(documents, 'STORED'))
        throw new BusinessError(
          'DOCUMENTS_REQUIRED',
          'Upload all required unexpired documents',
        );
      await this.repository.change(context, driver.id, {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      });
      await this.audit.record(
        context,
        actor.userId,
        'drivers.application_submitted',
      );
      return this.repository.find(driver.id, context);
    });
  }
  async review(actor: Actor, id: string, input: ReviewInput) {
    return this.transactions.run(async (context) => {
      const initial = await this.repository.find(id, context);
      if (!initial)
        throw new BusinessError('NOT_FOUND', 'Driver application not found');
      await this.identity.authorize(context, actor, ['ADMIN'], true, [
        initial.ownerUserId,
      ]);
      await this.repository.lock(context, id);
      const driver = await this.repository.find(id, context);
      if (!driver)
        throw new BusinessError('NOT_FOUND', 'Driver application not found');
      if (actor.userId === driver.ownerUserId)
        throw new BusinessError(
          'FORBIDDEN',
          'Independent driver review is required',
        );
      if (driver.revision !== input.expectedRevision)
        throw new BusinessError(
          'REVISION_CONFLICT',
          'Application revision changed',
        );
      const documents = await this.repository.documents(
        id,
        driver.revision,
        context,
      );
      const selected = DOCUMENT_KINDS.map((kind) =>
        documents.find((doc) => doc.kind === kind && doc.status === 'STORED'),
      ).filter((doc) => doc !== undefined);
      if (input.decision === 'approve') {
        if (
          driver.status !== 'SUBMITTED' ||
          !driver.vehicle ||
          !input.documentsReviewed ||
          !input.approvedClasses.length ||
          new Set(input.approvedClasses).size !==
            input.approvedClasses.length ||
          !requiredDocuments(selected, 'STORED')
        )
          throw new BusinessError(
            'INVALID_TRANSITION',
            'Submitted application, reviewed documents and eligible classes are required',
          );
        await this.repository.markDocuments(
          context,
          selected.map((doc) => doc.id),
          true,
        );
        await this.repository.change(context, id, {
          status: 'APPROVED',
          approvedClasses: input.approvedClasses,
          reviewedAt: new Date(),
        });
        await this.identity.setDriverRole(context, driver.ownerUserId, true);
      } else {
        if (input.approvedClasses.length)
          throw new BusinessError(
            'VALIDATION_ERROR',
            'Only approval can assign service classes',
          );
        const expected =
          input.decision === 'reject'
            ? 'SUBMITTED'
            : input.decision === 'suspend'
              ? 'APPROVED'
              : 'SUSPENDED';
        if (driver.status !== expected)
          throw new BusinessError(
            'INVALID_TRANSITION',
            'Decision does not match application state',
          );
        await this.repository.change(context, id, {
          status: input.decision === 'suspend' ? 'SUSPENDED' : 'REJECTED',
          approvedClasses: [],
          reviewedAt: new Date(),
        });
        if (input.decision === 'reject')
          await this.repository.markDocuments(
            context,
            documents
              .filter((doc) => doc.status === 'STORED')
              .map((doc) => doc.id),
            false,
          );
        await this.identity.setDriverRole(context, driver.ownerUserId, false);
        await this.repository.setPresence(context, id, actor.sessionId, false);
      }
      await this.repository.review(
        context,
        driver,
        actor.userId,
        input,
        selected.map((doc) => doc.id),
      );
      await this.audit.record(
        context,
        actor.userId,
        `drivers.application_${input.decision}`,
        driver.ownerUserId,
      );
      return this.repository.find(id, context);
    });
  }
  async availability(actor: Actor, online: boolean) {
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      const driver = await this.repository.findOwner(actor.userId, context);
      if (!driver)
        throw new BusinessError('NOT_FOUND', 'Driver application not found');
      await this.repository.lock(context, driver.id);
      if (!online) await this.jobs.assertDriverFree(context, actor.userId);
      if (online)
        assertApproved(
          driver,
          await this.repository.documents(driver.id, driver.revision, context),
        );
      const presence = await this.repository.setPresence(
        context,
        driver.id,
        actor.sessionId,
        online,
      );
      await this.audit.record(
        context,
        actor.userId,
        online ? 'drivers.online' : 'drivers.offline',
      );
      return presence;
    });
  }
  async location(actor: Actor, input: LocationInput) {
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor, ['DRIVER']);
      const driver = await this.repository.findOwner(actor.userId, context);
      if (!driver)
        throw new BusinessError('NOT_FOUND', 'Driver application not found');
      await this.repository.lock(context, driver.id);
      assertApproved(
        driver,
        await this.repository.documents(driver.id, driver.revision, context),
      );
      const p = driver.presence;
      const now = Date.now();
      const captured = Date.parse(input.capturedAt);
      if (
        !p?.online ||
        p.authSessionId !== actor.sessionId ||
        p.locationSessionId !== input.locationSessionId ||
        p.sessionExpiresAt.getTime() <= now
      )
        throw new BusinessError(
          'LOCATION_SESSION_EXPIRED',
          'Create a current online location session',
        );
      if (input.sequence <= p.sequence)
        throw new BusinessError(
          'LOCATION_SEQUENCE_CONFLICT',
          'Location update is not newer',
        );
      if (captured < now - 15000 || captured > now + 5000)
        throw new BusinessError(
          'STALE_LOCATION',
          'Location timestamp is stale or ahead of server time',
        );
      if (p.receivedAt && now - p.receivedAt.getTime() < 3000)
        throw new ApiError(
          'RATE_LIMITED',
          429,
          'Location updates are limited to one per three seconds',
          3,
        );
      assertPlausibleLocation(p, input);
      return this.repository.acceptLocation(context, driver.id, input);
    });
  }
  async eligibility(actor: Actor) {
    return this.transactions.run(async (context) => {
      await this.identity.authorize(context, actor);
      const driver = await this.repository.findOwner(actor.userId, context);
      if (!driver) return { eligible: false, reason: 'APPLICATION_REQUIRED' };
      await this.repository.lock(context, driver.id);
      const documents = await this.repository.documents(
        driver.id,
        driver.revision,
        context,
      );
      try {
        assertApproved(driver, documents);
      } catch (error) {
        if (!(error instanceof BusinessError)) throw error;
        return { eligible: false, reason: 'APPROVAL_OR_DOCUMENTS_REQUIRED' };
      }
      if (!freshPresence(driver) || !driver.presence)
        return { eligible: false, reason: 'LOCATION_NOT_FRESH' };
      try {
        await this.jobs.assertDriverFree(context, actor.userId);
      } catch (error) {
        if (!(error instanceof BusinessError)) throw error;
        return { eligible: false, reason: 'DRIVER_BUSY' };
      }
      // A location epoch never keeps a revoked login eligible for dispatch.
      await this.identity.validateDriverSession(
        context,
        actor.userId,
        driver.presence.authSessionId,
      );
      return {
        eligible: true,
        reason: null,
        locationSessionId: driver.presence.locationSessionId,
      };
    });
  }
  async view(driver: DriverRecord | null) {
    if (!driver) return null;
    const documents = await this.repository.documents(
      driver.id,
      driver.revision,
    );
    const reviews = await this.repository.reviews(driver.id);
    const v = driver.vehicle;
    return {
      id: driver.id,
      status: driver.status,
      revision: driver.revision,
      approvedClasses: driver.approvedClasses,
      vehicle: v
        ? {
            registrationPlate: v.registrationPlate,
            manufacturer: v.manufacturer,
            model: v.model,
            color: v.color,
            manufactureYear: v.manufactureYear,
            seatCount: v.seatCount,
          }
        : null,
      submittedAt: driver.submittedAt,
      reviewedAt: driver.reviewedAt,
      reviews: reviews.map((review) => ({
        revision: review.applicationRevision,
        decision: review.decision,
        reason: review.reason,
        createdAt: review.createdAt,
      })),
      documents: documents.map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        status: doc.status,
        contentType: doc.contentType,
        byteLength: doc.byteLength,
        contentSha256: doc.contentSha256,
        documentExpiresAt: doc.documentExpiresAt,
        uploadExpiresAt: doc.uploadExpiresAt,
      })),
      presence: driver.presence
        ? {
            online: driver.presence.online,
            locationSessionId: driver.presence.locationSessionId,
            sequence: driver.presence.sequence,
            sessionExpiresAt: driver.presence.sessionExpiresAt,
            receivedAt: driver.presence.receivedAt,
          }
        : null,
    };
  }
}
