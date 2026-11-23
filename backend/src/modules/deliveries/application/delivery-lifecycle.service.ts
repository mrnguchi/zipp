import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { DeliveryAccessService } from './delivery-access.service.js';
import { DeliveryRequestService } from './delivery-request.service.js';
import { DeliveryCodeService } from './delivery-code.service.js';
import { FinanceFacade } from '../../finance/finance.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import type { LocationInput } from '../../drivers/contracts/driver.schemas.js';
import { DeliveriesConfig } from '../deliveries.config.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { proximityMeters } from '../domain/delivery-rules.js';
import type { DeliveryState } from '../contracts/delivery-contracts.js';
export type CourierAction =
  | 'ARRIVE_PICKUP'
  | 'COLLECT'
  | 'TRANSIT'
  | 'ARRIVE_DESTINATION'
  | 'DELIVER'
  | 'ARRIVE_RETURN'
  | 'RETURN';
const stages: Record<
  CourierAction,
  {
    from: DeliveryState;
    to: DeliveryState;
    target?: 'pickup' | 'destination';
    proof?: 'PICKUP' | 'HANDOVER' | 'RETURN';
  }
> = {
  ARRIVE_PICKUP: { from: 'ASSIGNED', to: 'AT_PICKUP', target: 'pickup' },
  COLLECT: {
    from: 'AT_PICKUP',
    to: 'COLLECTED',
    target: 'pickup',
    proof: 'PICKUP',
  },
  TRANSIT: { from: 'COLLECTED', to: 'IN_TRANSIT' },
  ARRIVE_DESTINATION: {
    from: 'IN_TRANSIT',
    to: 'AT_DESTINATION',
    target: 'destination',
  },
  DELIVER: {
    from: 'AT_DESTINATION',
    to: 'DELIVERED',
    target: 'destination',
    proof: 'HANDOVER',
  },
  ARRIVE_RETURN: { from: 'RETURNING', to: 'AT_RETURN', target: 'pickup' },
  RETURN: {
    from: 'AT_RETURN',
    to: 'RETURNED',
    target: 'pickup',
    proof: 'RETURN',
  },
};
@Injectable()
export class DeliveryLifecycleService {
  constructor(
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
    @Inject(DeliveryAccessService)
    private readonly access: DeliveryAccessService,
    @Inject(DeliveryRequestService)
    private readonly requests: DeliveryRequestService,
    @Inject(DeliveryCodeService) private readonly codes: DeliveryCodeService,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {}
  async advance(
    a: Actor,
    key: string,
    id: string,
    action: CourierAction,
    code?: string,
  ) {
    this.config.assertEnabled();
    const stage = stages[action],
      fingerprint = this.requests.fingerprint([
        id,
        stage.proof
          ? this.access.identity.pseudonym('delivery-input-code', code ?? '')
          : null,
      ]);
    const result = await this.tx.run(async (c) => {
      // Replays need current participant authorization, but must not require a new GPS fix.
      await this.access.authorize(c, a, id);
      const replay = await this.requests.replay(
        c,
        a.userId,
        action,
        key,
        fingerprint,
      );
      if (replay) return { delivery: replay };
      const { delivery: d, position: p } = await this.access.lock(
        c,
        a,
        id,
        false,
        !!stage.target,
      );
      if (d.courierUserId !== a.userId)
        throw new BusinessError('NOT_FOUND', 'Assigned delivery not found');
      if (d.status !== stage.from)
        throw new BusinessError(
          'DELIVERY_STATE_CONFLICT',
          'Delivery is not at the required stage',
        );
      if (stage.target) {
        const target =
          stage.target === 'pickup'
            ? { latitude: d.pickupLatitude, longitude: d.pickupLongitude }
            : {
                latitude: d.destinationLatitude,
                longitude: d.destinationLongitude,
              };
        if (
          p?.latitude == null ||
          p.longitude == null ||
          proximityMeters(
            { latitude: p.latitude, longitude: p.longitude },
            target,
          ) > 500
        )
          throw new BusinessError(
            'COURIER_TOO_FAR',
            'Fresh courier location within 500 metres is required',
          );
      }
      if (
        stage.proof &&
        !(await this.codes.verify(c, d, stage.proof, code ?? ''))
      ) {
        await this.audit.record(c, a.userId, 'deliveries.proof_rejected');
        return { invalidProof: true as const };
      }
      let charged = d.chargedAmountXaf;
      const terminal = action === 'DELIVER' || action === 'RETURN';
      if (terminal) {
        if (action === 'DELIVER' || d.returnSettlement === 'CAPTURE_ORIGINAL') {
          await this.finance.captureFunds(
            c,
            d.reservationId,
            a.userId,
            d.commissionBps,
          );
          charged = d.quotedAmountXaf;
        } else if (d.returnSettlement === 'RELEASE_HOLD')
          await this.finance.releaseFunds(c, d.reservationId);
        else throw new Error('Return settlement missing');
        await this.access.jobs.close(c, id);
      }
      const delivery = await this.repo.transition(
        c,
        id,
        {
          status: stage.to,
          ...(action === 'COLLECT'
            ? { custody: 'WITH_COURIER' as const, collectedAt: new Date() }
            : {}),
          ...(terminal
            ? {
                custody:
                  action === 'DELIVER'
                    ? ('WITH_RECIPIENT' as const)
                    : ('RETURNED_TO_SENDER' as const),
                completedAt: new Date(),
                chargedAmountXaf: charged,
              }
            : {}),
        },
        `delivery.${stage.to.toLowerCase()}`,
      );
      await this.repo.remember(c, a.userId, action, key, fingerprint, id);
      await this.audit.record(
        c,
        a.userId,
        `deliveries.${stage.to.toLowerCase()}`,
      );
      return { delivery };
    });
    if ('invalidProof' in result)
      throw new BusinessError(
        'DELIVERY_PROOF_INVALID',
        'Code is invalid, expired or temporarily blocked',
      );
    return result.delivery;
  }
  async cancel(a: Actor, key: string, id: string, reason: string) {
    this.config.assertEnabled();
    const fp = this.requests.fingerprint([id, reason]);
    return this.tx.run(async (c) => {
      const { delivery: d } = await this.access.lock(c, a, id);
      const replay = await this.requests.replay(c, a.userId, 'CANCEL', key, fp);
      if (replay) return replay;
      if (![d.bookerUserId, d.courierUserId].includes(a.userId))
        throw new BusinessError(
          'FORBIDDEN',
          'Only booker or assigned courier may cancel',
        );
      if (
        d.custody !== 'WITH_SENDER' ||
        !['SEARCHING', 'ASSIGNED', 'AT_PICKUP'].includes(d.status)
      )
        throw new BusinessError(
          'DELIVERY_CUSTODY_REQUIRES_REVIEW',
          'After collection, open an issue for a controlled return',
        );
      const fee =
        a.userId === d.bookerUserId && d.courierUserId
          ? d.cancellationFeeXaf < d.quotedAmountXaf
            ? d.cancellationFeeXaf
            : d.quotedAmountXaf
          : 0n;
      if (fee > 0n && d.courierUserId)
        await this.finance.captureFunds(
          c,
          d.reservationId,
          d.courierUserId,
          d.commissionBps,
          fee.toString(),
        );
      else await this.finance.releaseFunds(c, d.reservationId);
      await this.access.jobs.close(c, id);
      await this.repo.withdrawOffers(c, id);
      await this.repo.stopTask(c, id);
      const row = await this.repo.transition(
        c,
        id,
        {
          status: 'CANCELLED',
          completedAt: new Date(),
          cancellationReason: reason,
          chargedAmountXaf: fee,
        },
        'delivery.cancelled',
      );
      await this.repo.remember(c, a.userId, 'CANCEL', key, fp, id, reason);
      await this.audit.record(c, a.userId, 'deliveries.cancelled');
      return row;
    });
  }
  async custodyLocation(a: Actor, id: string, input?: LocationInput) {
    this.config.assertEnabled();
    return this.tx.run(async (c) => {
      const d = await this.access.authorize(c, a, id);
      if (
        d.courierUserId !== a.userId ||
        d.custody !== 'WITH_COURIER' ||
        d.completedAt
      )
        throw new BusinessError(
          'NOT_FOUND',
          'Active custody delivery not found',
        );
      // Both completion and reassignment need the same user locks, so ownership stays stable.
      const p = input
        ? await this.access.drivers.custodyLocation(c, a, input)
        : await this.access.drivers.custodyEpoch(c, a);
      return {
        locationSessionId: p.locationSessionId,
        sessionExpiresAt: p.sessionExpiresAt,
        sequence: p.sequence,
        receivedAt: p.receivedAt,
      };
    });
  }
}
