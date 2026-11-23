import { randomInt, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RideRepository } from './ride.repository.js';
import { RideRequestService } from './ride-request.service.js';
import { RideAccessService } from './ride-access.service.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { assertParticipant, distanceMeters } from '../domain/ride-rules.js';
import { RidesConfig } from '../rides.config.js';
import type { RideRecord } from '../contracts/ride-contracts.js';
@Injectable()
export class RideLifecycleService {
  constructor(
    @Inject(RideRepository) private readonly repository: RideRepository,
    @Inject(RideRequestService) private readonly requests: RideRequestService,
    @Inject(RideAccessService) private readonly access: RideAccessService,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(RidesConfig) private readonly config: RidesConfig,
  ) {}
  async advance(
    actor: Actor,
    key: string,
    id: string,
    action: 'arrive' | 'start',
  ) {
    this.config.assertEnabled();
    const fingerprint = this.requests.fingerprint([id]);
    return this.transactions.run(async (context) => {
      await this.access.authorize(context, actor, id);
      const replay = await this.requests.replay(
        context,
        actor.userId,
        action,
        key,
        fingerprint,
      );
      if (replay) return replay;
      const { ride, position } = await this.access.lock(
        context,
        actor,
        id,
        ['DRIVER'],
        false,
        true,
      );
      if (ride.status !== (action === 'arrive' ? 'ASSIGNED' : 'ARRIVED'))
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Ride is not ready for this driver action',
        );
      if (
        !position ||
        position.latitude === null ||
        position.longitude === null ||
        distanceMeters(
          { latitude: ride.pickupLatitude, longitude: ride.pickupLongitude },
          { latitude: position.latitude, longitude: position.longitude },
        ) > 500
      )
        throw new BusinessError(
          'DRIVER_NOT_AT_PICKUP',
          'A fresh nearby pickup position is required',
        );
      const now = new Date();
      const updated = await this.repository.transition(
        context,
        id,
        action === 'arrive'
          ? { status: 'ARRIVED', arrivedAt: now }
          : { status: 'IN_PROGRESS', startedAt: now },
        action === 'arrive' ? 'ride.arrived' : 'ride.started',
      );
      await this.repository.remember(
        context,
        actor.userId,
        action,
        key,
        fingerprint,
        id,
      );
      await this.audit.record(
        context,
        actor.userId,
        `rides.${action}`,
        ride.customerUserId,
      );
      return updated;
    });
  }
  async issuePin(actor: Actor, id: string) {
    this.config.assertEnabled();
    return this.transactions.run(async (context) => {
      const { ride } = await this.access.lock(context, actor, id);
      if (ride.customerUserId !== actor.userId)
        throw new BusinessError('NOT_FOUND', 'Customer ride not found');
      if (!['ASSIGNED', 'ARRIVED', 'IN_PROGRESS'].includes(ride.status))
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Completion code is unavailable in this state',
        );
      const now = new Date(),
        windowActive =
          ride.pinIssueWindowEndsAt !== null && ride.pinIssueWindowEndsAt > now;
      if (
        (ride.pinIssuedAt &&
          now.getTime() - ride.pinIssuedAt.getTime() < 60000) ||
        (windowActive && ride.pinIssueCount >= 3)
      )
        throw new ApiError(
          'RATE_LIMITED',
          429,
          'Completion code issuance is limited',
          windowActive && ride.pinIssueCount >= 3 && ride.pinIssueWindowEndsAt
            ? Math.max(
                1,
                Math.ceil(
                  (ride.pinIssueWindowEndsAt.getTime() - now.getTime()) / 1000,
                ),
              )
            : 60,
        );
      const pin = String(randomInt(1_000_000)).padStart(6, '0'),
        expiresAt = new Date(now.getTime() + 1800000);
      await this.repository.transition(
        context,
        id,
        {
          completionPinHash: this.identity.pseudonym(
            `ride-completion:${id}`,
            pin,
          ),
          pinExpiresAt: expiresAt,
          pinIssuedAt: now,
          pinIssueCount: windowActive ? ride.pinIssueCount + 1 : 1,
          pinIssueWindowEndsAt: windowActive
            ? ride.pinIssueWindowEndsAt
            : new Date(now.getTime() + 3600000),
        },
        'ride.completion_code_changed',
      );
      await this.audit.record(
        context,
        actor.userId,
        'rides.completion_code_issued',
      );
      return { rideId: id, pin, expiresAt };
    });
  }
  async complete(actor: Actor, key: string, id: string, pin: string) {
    this.config.assertEnabled();
    const fingerprint = this.requests.fingerprint([
      id,
      this.identity.pseudonym('ride-completion-request', pin),
    ]);
    const outcome = await this.transactions.run(
      async (
        context,
      ): Promise<
        { ok: true; ride: RideRecord } | { ok: false; retryAfter: number }
      > => {
        // Replays must not require a still-fresh destination observation after completed assignment.
        const initial = await this.repository.ride(id, context);
        if (initial?.status === 'COMPLETED') {
          await this.identity.authorize(context, actor, [], false, [
            initial.customerUserId,
            ...(initial.driverUserId ? [initial.driverUserId] : []),
          ]);
          const replay = await this.requests.replay(
            context,
            actor.userId,
            'complete',
            key,
            fingerprint,
          );
          if (replay) return { ok: true, ride: replay };
          throw new BusinessError(
            'INVALID_TRANSITION',
            'Ride is already completed',
          );
        }
        const { ride, position } = await this.access.lock(
          context,
          actor,
          id,
          ['DRIVER'],
          false,
          true,
        );
        const replay = await this.requests.replay(
          context,
          actor.userId,
          'complete',
          key,
          fingerprint,
        );
        if (replay) return { ok: true, ride: replay };
        if (ride.status !== 'IN_PROGRESS' || !ride.driverUserId)
          throw new BusinessError(
            'INVALID_TRANSITION',
            'Only an in-progress assigned ride can complete',
          );
        if (
          !position ||
          position.latitude === null ||
          position.longitude === null ||
          distanceMeters(
            {
              latitude: ride.destinationLatitude,
              longitude: ride.destinationLongitude,
            },
            { latitude: position.latitude, longitude: position.longitude },
          ) > 500
        )
          throw new BusinessError(
            'DRIVER_NOT_AT_DESTINATION',
            'A fresh nearby destination position is required',
          );
        const now = new Date(),
          windowActive =
            ride.pinFailureWindowEndsAt !== null &&
            ride.pinFailureWindowEndsAt > now;
        if (
          windowActive &&
          ride.pinFailureCount >= 5 &&
          ride.pinFailureWindowEndsAt
        )
          return {
            ok: false,
            retryAfter: Math.max(
              1,
              Math.ceil(
                (ride.pinFailureWindowEndsAt.getTime() - now.getTime()) / 1000,
              ),
            ),
          };
        const candidate = this.identity.pseudonym(`ride-completion:${id}`, pin),
          stored = ride.completionPinHash;
        const valid =
          stored !== null &&
          /^[a-f0-9]{64}$/.test(stored) &&
          ride.pinExpiresAt !== null &&
          ride.pinExpiresAt > now &&
          timingSafeEqual(
            Buffer.from(stored, 'hex'),
            Buffer.from(candidate, 'hex'),
          );
        if (!valid) {
          await this.repository.security(context, id, {
            pinFailureCount: windowActive ? ride.pinFailureCount + 1 : 1,
            pinFailureWindowEndsAt: windowActive
              ? ride.pinFailureWindowEndsAt
              : new Date(now.getTime() + 900000),
          });
          await this.audit.record(
            context,
            actor.userId,
            'rides.completion_code_rejected',
            ride.customerUserId,
          );
          return { ok: false, retryAfter: 0 };
        }
        await this.finance.captureFunds(
          context,
          ride.reservationId,
          ride.driverUserId,
          ride.commissionBps,
        );
        await this.jobs.close(context, id);
        const updated = await this.repository.transition(
          context,
          id,
          {
            status: 'COMPLETED',
            chargedAmountXaf: ride.quotedAmountXaf,
            completedAt: now,
            completionPinHash: null,
            pinExpiresAt: null,
            pinFailureCount: 0,
            pinFailureWindowEndsAt: null,
          },
          'ride.completed',
        );
        await this.repository.remember(
          context,
          actor.userId,
          'complete',
          key,
          fingerprint,
          id,
        );
        await this.audit.record(
          context,
          actor.userId,
          'rides.completed',
          ride.customerUserId,
        );
        return { ok: true, ride: updated };
      },
    );
    if (!outcome.ok)
      throw new ApiError(
        outcome.retryAfter ? 'RATE_LIMITED' : 'INVALID_COMPLETION_PIN',
        outcome.retryAfter ? 429 : 400,
        outcome.retryAfter
          ? 'Retry completion proof later'
          : 'Completion code is invalid or expired',
        outcome.retryAfter || undefined,
      );
    return outcome.ride;
  }
  async cancel(actor: Actor, key: string, id: string, reason: string) {
    this.config.assertEnabled();
    const fingerprint = this.requests.fingerprint([id, reason]);
    return this.transactions.run(async (context) => {
      const { ride } = await this.access.lock(context, actor, id);
      assertParticipant(ride, actor.userId);
      const replay = await this.requests.replay(
        context,
        actor.userId,
        'cancel',
        key,
        fingerprint,
      );
      if (replay) return replay;
      if (!['SEARCHING', 'ASSIGNED', 'ARRIVED'].includes(ride.status))
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Use a dispute for an in-progress or completed ride',
        );
      const fee =
        actor.userId === ride.customerUserId && ride.driverUserId
          ? ride.cancellationFeeXaf < ride.quotedAmountXaf
            ? ride.cancellationFeeXaf
            : ride.quotedAmountXaf
          : 0n;
      if (fee > 0n && ride.driverUserId)
        await this.finance.captureFunds(
          context,
          ride.reservationId,
          ride.driverUserId,
          ride.commissionBps,
          fee.toString(),
        );
      else await this.finance.releaseFunds(context, ride.reservationId);
      await this.jobs.close(context, id);
      await this.repository.withdrawOffers(context, id);
      await this.repository.stopTask(context, id);
      const updated = await this.repository.transition(
        context,
        id,
        {
          status: 'CANCELLED',
          chargedAmountXaf: fee,
          completedAt: new Date(),
          cancellationReason: reason,
          completionPinHash: null,
          pinExpiresAt: null,
        },
        'ride.cancelled',
      );
      await this.repository.remember(
        context,
        actor.userId,
        'cancel',
        key,
        fingerprint,
        id,
      );
      await this.audit.record(
        context,
        actor.userId,
        'rides.cancelled',
        ride.customerUserId,
      );
      return updated;
    });
  }
}
