import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { DeliveryAccessService } from './delivery-access.service.js';
import { DeliveryRequestService } from './delivery-request.service.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { DeliveriesConfig } from '../deliveries.config.js';
import { hasParticipant } from '../domain/delivery-rules.js';
@Injectable()
export class DeliveryReviewService {
  constructor(
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
    @Inject(DeliveryAccessService)
    private readonly access: DeliveryAccessService,
    @Inject(DeliveryRequestService)
    private readonly requests: DeliveryRequestService,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {}
  async inspect(a: Actor, id: string) {
    return this.tx.run(async (c) => {
      const d = await this.access.authorize(c, a, id, true);
      await this.audit.record(c, a.userId, 'deliveries.review_accessed');
      return {
        id: d.id,
        status: d.status,
        custody: d.custody,
        version: d.version,
        chargedAmountXaf: d.chargedAmountXaf.toString(),
        refundedAmountXaf: d.refundedAmountXaf.toString(),
        issues: await this.repo.issues(id, c),
        dispatch: await this.repo.taskInfo(id),
      };
    });
  }
  async retryDispatch(a: Actor, key: string, id: string, reason: string) {
    this.config.assertEnabled();
    const fp = this.requests.fingerprint([id, reason]);
    return this.tx.run(async (c) => {
      const { delivery: d } = await this.access.lock(c, a, id, true);
      const old = await this.requests.replay(
        c,
        a.userId,
        'RETRY_DISPATCH',
        key,
        fp,
      );
      if (old) return old;
      if (d.status !== 'SEARCHING')
        throw new BusinessError(
          'DELIVERY_STATE_CONFLICT',
          'Only a searching delivery can resume dispatch',
        );
      await this.repo.retryTask(c, id);
      await this.repo.remember(
        c,
        a.userId,
        'RETRY_DISPATCH',
        key,
        fp,
        id,
        reason,
      );
      await this.audit.record(
        c,
        a.userId,
        'deliveries.dispatch_retry_requested',
      );
      return d;
    });
  }
  async issue(a: Actor, key: string, id: string, kind: string, reason: string) {
    this.config.assertEnabled();
    const fp = this.requests.fingerprint([id, kind, reason]);
    return this.tx.run(async (c) => {
      const { delivery: d } = await this.access.lock(c, a, id);
      const old = await this.requests.replay(c, a.userId, 'ISSUE', key, fp);
      if (old) return old;
      if ((await this.repo.issues(id, c)).length >= 10)
        throw new BusinessError('ISSUE_LIMIT', 'Delivery issue limit reached');
      await this.repo.createIssue(c, id, a.userId, kind, reason);
      const row = await this.repo.transition(
        c,
        d.id,
        {},
        'delivery.issue_opened',
      );
      await this.repo.remember(c, a.userId, 'ISSUE', key, fp, id, reason);
      await this.audit.record(c, a.userId, 'deliveries.issue_opened');
      return row;
    });
  }
  async resolve(
    a: Actor,
    key: string,
    id: string,
    issueId: string,
    reason: string,
    settlement?: 'RELEASE_HOLD' | 'CAPTURE_ORIGINAL',
  ) {
    this.config.assertEnabled();
    const action = settlement ? 'AUTHORIZE_RETURN' : 'REFUND',
      fp = this.requests.fingerprint([id, issueId, reason, settlement ?? null]);
    return this.tx.run(async (c) => {
      const { delivery: d } = await this.access.lock(c, a, id, true);
      if (hasParticipant(d, a.userId))
        throw new BusinessError(
          'FORBIDDEN',
          'Independent recent-MFA administrator required',
        );
      const old = await this.requests.replay(c, a.userId, action, key, fp);
      if (old) return old;
      const issue = await this.repo.issue(issueId, c);
      if (!issue || issue.deliveryId !== id || issue.resolvedAt)
        throw new BusinessError(
          'ISSUE_STATE_CONFLICT',
          'An unresolved delivery issue is required',
        );
      let row;
      if (settlement) {
        if (
          d.custody !== 'WITH_COURIER' ||
          !['COLLECTED', 'IN_TRANSIT', 'AT_DESTINATION'].includes(d.status)
        )
          throw new BusinessError(
            'DELIVERY_STATE_CONFLICT',
            'Package must still be in courier custody',
          );
        row = await this.repo.transition(
          c,
          id,
          {
            status: 'RETURNING',
            returnSettlement: settlement,
            returnAuthorizedById: a.userId,
            returnAuthorizationReason: reason,
          },
          'delivery.return_authorized',
        );
      } else {
        if (
          !d.completedAt ||
          d.chargedAmountXaf <= 0n ||
          d.refundedAmountXaf > 0n
        )
          throw new BusinessError(
            'REFUND_STATE_CONFLICT',
            'A charged, unrefunded terminal delivery is required',
          );
        await this.finance.refundFunds(
          c,
          d.reservationId,
          `delivery:${id}:refund`,
          d.chargedAmountXaf.toString(),
        );
        row = await this.repo.transition(
          c,
          id,
          { refundedAmountXaf: d.chargedAmountXaf },
          'delivery.refunded',
        );
      }
      await this.repo.resolveIssue(
        c,
        issueId,
        a.userId,
        settlement ? 'RETURN_AUTHORIZED' : 'REFUNDED',
        reason,
      );
      await this.repo.remember(c, a.userId, action, key, fp, id, reason);
      await this.audit.record(
        c,
        a.userId,
        `deliveries.${action.toLowerCase()}`,
      );
      return row;
    });
  }
  async rate(
    a: Actor,
    key: string,
    id: string,
    stars: number,
    comment?: string,
  ) {
    this.config.assertEnabled();
    const fp = this.requests.fingerprint([id, stars, comment ?? null]);
    return this.tx.run(async (c) => {
      const { delivery: d } = await this.access.lock(c, a, id);
      const old = await this.requests.replay(c, a.userId, 'RATE', key, fp);
      if (old) return old;
      if (d.bookerUserId !== a.userId || d.status !== 'DELIVERED')
        throw new BusinessError(
          'FORBIDDEN',
          'Only the booker may rate a delivered package',
        );
      await this.repo.rate(c, d, stars, comment);
      await this.repo.remember(c, a.userId, 'RATE', key, fp, id);
      return d;
    });
  }
  async claim(a: Actor, key: string, id: string, role: 'SENDER' | 'RECIPIENT') {
    this.config.assertEnabled();
    const fp = this.requests.fingerprint([id, role]);
    return this.tx.run(async (c) => {
      // A matching verified phone may claim an unbound slot; never enumerate delivery contacts.
      const initial = await this.repo.get(id, c);
      if (!initial) throw new BusinessError('NOT_FOUND', 'Delivery not found');
      await this.access.identity.authorize(c, a, [], false, [
        initial.bookerUserId,
        ...[
          initial.senderUserId,
          initial.recipientUserId,
          initial.courierUserId,
        ].filter((v): v is string => !!v),
      ]);
      await this.access.jobs.lock(c, id);
      await this.repo.lock(c, id);
      const d = await this.repo.get(id, c);
      if (!d) throw new BusinessError('NOT_FOUND', 'Delivery not found');
      if (
        d.senderUserId !== initial.senderUserId ||
        d.recipientUserId !== initial.recipientUserId ||
        d.courierUserId !== initial.courierUserId
      )
        throw new BusinessError(
          'DELIVERY_STATE_CHANGED',
          'Retry the same request',
        );
      const phone = await this.access.identity.actorPhone(c, a),
        bound = role === 'SENDER' ? d.senderUserId : d.recipientUserId;
      if (
        phone !== (role === 'SENDER' ? d.senderPhone : d.recipientPhone) ||
        (bound && bound !== a.userId) ||
        d.courierUserId === a.userId
      )
        throw new BusinessError('NOT_FOUND', 'Delivery not found');
      const old = await this.requests.replay(
        c,
        a.userId,
        'CLAIM_CONTACT',
        key,
        fp,
      );
      if (old) return old;
      const row = await this.repo.transition(
        c,
        id,
        role === 'SENDER'
          ? { senderUserId: a.userId }
          : { recipientUserId: a.userId },
        'delivery.contact_claimed',
      );
      await this.repo.remember(c, a.userId, 'CLAIM_CONTACT', key, fp, id);
      await this.audit.record(c, a.userId, 'deliveries.contact_claimed');
      return row;
    });
  }
}
