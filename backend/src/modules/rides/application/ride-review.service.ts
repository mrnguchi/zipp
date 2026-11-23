import { Inject, Injectable } from '@nestjs/common';
import { RideRepository } from './ride.repository.js';
import { RideAccessService } from './ride-access.service.js';
import { RideRequestService } from './ride-request.service.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { assertParticipant } from '../domain/ride-rules.js';
import { RidesConfig } from '../rides.config.js';
import type { RideRecord } from '../contracts/ride-contracts.js';
@Injectable()
export class RideReviewService {
  constructor(
    @Inject(RideRepository) private readonly repository: RideRepository,
    @Inject(RideAccessService) private readonly access: RideAccessService,
    @Inject(RideRequestService) private readonly requests: RideRequestService,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(JobsFacade) private readonly jobs: JobsFacade,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(RidesConfig) private readonly config: RidesConfig,
  ) {}
  async rate(
    actor: Actor,
    key: string,
    id: string,
    stars: number,
    comment?: string,
  ) {
    this.config.assertEnabled();
    const fingerprint = this.requests.fingerprint([
      id,
      String(stars),
      comment ?? '',
    ]);
    return this.transactions.run(async (context) => {
      const { ride } = await this.access.lock(context, actor, id);
      if (ride.customerUserId !== actor.userId)
        throw new BusinessError('NOT_FOUND', 'Customer ride not found');
      const replay = await this.requests.replay(
        context,
        actor.userId,
        'RATE',
        key,
        fingerprint,
      );
      if (replay) return replay;
      if (ride.status !== 'COMPLETED')
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Only completed rides can be rated',
        );
      await this.repository.rate(context, ride, stars, comment);
      await this.repository.remember(
        context,
        actor.userId,
        'RATE',
        key,
        fingerprint,
        id,
      );
      await this.audit.record(
        context,
        actor.userId,
        'rides.rated',
        ride.driverUserId ?? undefined,
      );
      return ride;
    });
  }
  async dispute(actor: Actor, key: string, id: string, reason: string) {
    this.config.assertEnabled();
    const fingerprint = this.requests.fingerprint([id, reason]);
    return this.transactions.run(async (context) => {
      const { ride } = await this.access.lock(context, actor, id);
      assertParticipant(ride, actor.userId);
      const replay = await this.requests.replay(
        context,
        actor.userId,
        'DISPUTE',
        key,
        fingerprint,
      );
      if (replay) return replay;
      if (
        !['IN_PROGRESS', 'COMPLETED'].includes(ride.status) &&
        !(ride.status === 'CANCELLED' && ride.chargedAmountXaf > 0n)
      )
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Disputes require an in-progress or completed ride',
        );
      const previous = await this.repository.dispute(id, context);
      await this.repository.openDispute(context, id, actor.userId, reason);
      const updated = previous
        ? ride
        : await this.repository.transition(
            context,
            id,
            {},
            'ride.dispute_opened',
          );
      await this.repository.remember(
        context,
        actor.userId,
        'DISPUTE',
        key,
        fingerprint,
        id,
      );
      await this.audit.record(
        context,
        actor.userId,
        'rides.dispute_opened',
        ride.customerUserId,
      );
      return updated;
    });
  }
  async resolve(
    actor: Actor,
    key: string,
    id: string,
    resolution: 'release' | 'refund',
    reason: string,
  ) {
    this.config.assertEnabled();
    const fingerprint = this.requests.fingerprint([id, resolution, reason]);
    return this.transactions.run(async (context) => {
      const { ride } = await this.access.lock(
        context,
        actor,
        id,
        ['ADMIN'],
        true,
      );
      const replay = await this.requests.replay(
        context,
        actor.userId,
        'RESOLVE_DISPUTE',
        key,
        fingerprint,
      );
      if (replay) return replay;
      if ([ride.customerUserId, ride.driverUserId].includes(actor.userId))
        throw new BusinessError(
          'FORBIDDEN',
          'Independent dispute resolution is required',
        );
      const dispute = await this.repository.dispute(id, context);
      if (!dispute || dispute.resolvedAt)
        throw new BusinessError(
          'INVALID_TRANSITION',
          'An unresolved dispute is required',
        );
      let updated: RideRecord;
      if (resolution === 'release') {
        if (ride.status !== 'IN_PROGRESS')
          throw new BusinessError(
            'INVALID_TRANSITION',
            'Only an in-progress ride hold can be released',
          );
        await this.finance.releaseFunds(context, ride.reservationId);
        await this.jobs.close(context, id);
        updated = await this.repository.transition(
          context,
          id,
          {
            status: 'CANCELLED',
            chargedAmountXaf: 0n,
            completedAt: new Date(),
            cancellationReason: reason,
            completionPinHash: null,
            pinExpiresAt: null,
          },
          'ride.dispute_released',
        );
      } else {
        if (
          !['COMPLETED', 'CANCELLED'].includes(ride.status) ||
          ride.chargedAmountXaf <= 0n
        )
          throw new BusinessError(
            'INVALID_TRANSITION',
            'Only a paid completed ride can be refunded',
          );
        await this.finance.refundFunds(
          context,
          ride.reservationId,
          `dispute-${id}`,
          ride.chargedAmountXaf.toString(),
        );
        updated = await this.repository.transition(
          context,
          id,
          {},
          'ride.refunded',
        );
      }
      await this.repository.resolveDispute(
        context,
        id,
        actor.userId,
        resolution,
        reason,
      );
      await this.repository.remember(
        context,
        actor.userId,
        'RESOLVE_DISPUTE',
        key,
        fingerprint,
        id,
        reason,
      );
      await this.audit.record(
        context,
        actor.userId,
        'rides.dispute_resolved',
        ride.customerUserId,
      );
      return updated;
    });
  }
  async retryDispatch(actor: Actor, key: string, id: string, reason: string) {
    this.config.assertEnabled();
    const fingerprint = this.requests.fingerprint([id, reason]);
    return this.transactions.run(async (context) => {
      const { ride } = await this.access.lock(
        context,
        actor,
        id,
        ['ADMIN'],
        true,
      );
      const replay = await this.requests.replay(
        context,
        actor.userId,
        'RETRY_DISPATCH',
        key,
        fingerprint,
      );
      if (replay) return replay;
      if (ride.status !== 'SEARCHING')
        throw new BusinessError(
          'INVALID_TRANSITION',
          'Only a searching ride can resume dispatch',
        );
      await this.repository.retryTask(context, id);
      await this.repository.remember(
        context,
        actor.userId,
        'RETRY_DISPATCH',
        key,
        fingerprint,
        id,
        reason,
      );
      await this.audit.record(
        context,
        actor.userId,
        'rides.dispatch_retry_requested',
        ride.customerUserId,
      );
      return ride;
    });
  }
}
