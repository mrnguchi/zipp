import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { DriversFacade } from '../../drivers/drivers.facade.js';
import { JobsFacade } from '../../jobs/jobs.facade.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { hasParticipant, deliveryTerminal } from '../domain/delivery-rules.js';
@Injectable()
export class DeliveryAccessService {
  async operationsSummary(c: TransactionContext, a: Actor, id: string) {
    const first = await this.repository.get(id, c);
    if (!first) throw new BusinessError('NOT_FOUND', 'Delivery not found');
    await this.identity.authorize(c, a, ['SUPPORT', 'ADMIN'], true, [
      first.bookerUserId,
      ...[
        first.courierUserId,
        first.senderUserId,
        first.recipientUserId,
      ].filter((v): v is string => !!v),
    ]);
    await this.jobs.lock(c, id);
    await this.repository.lock(c, id);
    const d = await this.repository.get(id, c);
    if (!d) throw new BusinessError('NOT_FOUND', 'Delivery not found');
    if (
      d.courierUserId !== first.courierUserId ||
      d.senderUserId !== first.senderUserId ||
      d.recipientUserId !== first.recipientUserId
    )
      throw new BusinessError('DELIVERY_STATE_CHANGED', 'Reload the delivery');
    return {
      id: d.id,
      status: d.status,
      custody: d.custody,
      bookerUserId: d.bookerUserId,
      courierUserId: d.courierUserId,
    };
  }
  async callingContext(
    c: TransactionContext,
    a: Actor,
    id: string,
    peer: string,
  ) {
    const { delivery: d } = await this.lock(c, a, id, false, false, [peer]);
    const customers = [d.bookerUserId, d.senderUserId, d.recipientUserId];
    return {
      eligible:
        !deliveryTerminal(d.status) &&
        !!d.courierUserId &&
        a.userId !== peer &&
        ((a.userId === d.courierUserId && customers.includes(peer)) ||
          (customers.includes(a.userId) && peer === d.courierUserId)),
    };
  }
  /** No staff-role shortcut and no GPS reads: only current private participants. */
  async communicationContext(c: TransactionContext, actor: Actor, id: string) {
    const { delivery } = await this.lock(c, actor, id);
    return {
      writable: !deliveryTerminal(delivery.status),
      participantUserIds: [
        ...new Set([
          delivery.bookerUserId,
          ...[
            delivery.senderUserId,
            delivery.recipientUserId,
            delivery.courierUserId,
          ].filter((id): id is string => !!id),
        ]),
      ],
    };
  }
  constructor(
    @Inject(DeliveryRepository) readonly repository: DeliveryRepository,
    @Inject(IdentityFacade) readonly identity: IdentityFacade,
    @Inject(DriversFacade) readonly drivers: DriversFacade,
    @Inject(JobsFacade) readonly jobs: JobsFacade,
  ) {}
  async authorize(
    c: TransactionContext,
    a: Actor,
    id: string,
    admin = false,
    otherUserIds: readonly string[] = [],
  ) {
    const initial = await this.repository.get(id, c);
    if (!initial) throw new BusinessError('NOT_FOUND', 'Delivery not found');
    await this.identity.authorize(c, a, admin ? ['ADMIN'] : [], admin, [
      initial.bookerUserId,
      ...[
        initial.senderUserId,
        initial.recipientUserId,
        initial.courierUserId,
      ].filter((v): v is string => !!v),
      ...otherUserIds,
    ]);
    const d = await this.repository.get(id, c);
    if (!d) throw new BusinessError('NOT_FOUND', 'Delivery not found');
    if (
      d.courierUserId !== initial.courierUserId ||
      d.senderUserId !== initial.senderUserId ||
      d.recipientUserId !== initial.recipientUserId
    )
      throw new BusinessError(
        'DELIVERY_STATE_CHANGED',
        'Delivery changed; retry the same request',
      );
    if (!admin && !hasParticipant(d, a.userId))
      throw new BusinessError('NOT_FOUND', 'Delivery not found');
    return d;
  }
  async lock(
    c: TransactionContext,
    a: Actor,
    id: string,
    admin = false,
    position = false,
    otherUserIds: readonly string[] = [],
  ) {
    const d = await this.authorize(c, a, id, admin, otherUserIds);
    if (position && d.courierUserId !== a.userId)
      throw new BusinessError('NOT_FOUND', 'Assigned delivery not found');
    // Driver aggregate precedes job locks. Custody return does not grant dispatch approval.
    const p = position
      ? d.custody === 'WITH_COURIER'
        ? await this.drivers.custodyPosition(c, a.userId)
        : (
            await this.drivers.assertDispatchEligible(
              c,
              a.userId,
              d.serviceClass,
              false,
            )
          ).location
      : null;
    await this.jobs.lock(c, id);
    await this.repository.lock(c, id);
    const current = await this.repository.get(id, c);
    if (
      !current ||
      current.courierUserId !== d.courierUserId ||
      current.senderUserId !== d.senderUserId ||
      current.recipientUserId !== d.recipientUserId
    )
      throw new BusinessError(
        'DELIVERY_STATE_CHANGED',
        'Delivery changed; retry the same request',
      );
    return { delivery: current, position: p };
  }
}
