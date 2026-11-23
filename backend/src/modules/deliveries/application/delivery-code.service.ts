import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { DeliveryAccessService } from './delivery-access.service.js';
import { ContactCodeDelivery } from './delivery-providers.port.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import type { DeliveryRecord } from '../contracts/delivery-contracts.js';
import type { ProofPurpose } from '../contracts/delivery.schemas.js';
import { DeliveriesConfig } from '../deliveries.config.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { ApiError } from '../../../shared/errors/api-error.js';
@Injectable()
export class DeliveryCodeService {
  constructor(
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
    @Inject(DeliveryAccessService)
    private readonly access: DeliveryAccessService,
    @Inject(ContactCodeDelivery) private readonly delivery: ContactCodeDelivery,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {}
  digest(id: string, purpose: ProofPurpose, requestId: string, code: string) {
    return this.identity.pseudonym(
      'delivery-proof',
      JSON.stringify([id, purpose, requestId, code]),
    );
  }
  async issue(a: Actor, id: string, purpose: ProofPurpose) {
    this.config.assertEnabled();
    const message = await this.tx.run(async (c) => {
      const { delivery: d } = await this.access.lock(c, a, id);
      const expected =
        purpose === 'PICKUP'
          ? 'AT_PICKUP'
          : purpose === 'HANDOVER'
            ? 'AT_DESTINATION'
            : 'AT_RETURN';
      if (d.status !== expected)
        throw new BusinessError(
          'DELIVERY_STATE_CONFLICT',
          'Proof cannot be issued at this stage',
        );
      const contact =
        purpose === 'HANDOVER' ? d.recipientUserId : d.senderUserId;
      if (![d.bookerUserId, d.courierUserId, contact].includes(a.userId))
        throw new BusinessError(
          'FORBIDDEN',
          'Only the relevant contact, booker or courier may request this code',
        );
      const old = await this.repo.proof(c, id, purpose),
        now = Date.now();
      if (old?.issuedAt && now - old.issuedAt.getTime() < 60000)
        throw new ApiError(
          'RATE_LIMITED',
          429,
          'Wait before requesting another code',
          60,
        );
      const count =
        old?.issueWindowEndsAt && old.issueWindowEndsAt.getTime() > now
          ? old.issueCount
          : 0;
      if (count >= 3)
        throw new ApiError(
          'RATE_LIMITED',
          429,
          'Contact code issuance limit reached',
          Math.max(
            1,
            Math.ceil(
              ((old?.issueWindowEndsAt?.getTime() ?? now + 3600000) - now) /
                1000,
            ),
          ),
        );
      const code = randomInt(0, 1000000).toString().padStart(6, '0'),
        requestId = randomUUID(),
        expiresAt = new Date(now + 900000);
      await this.repo.updateProof(c, id, purpose, {
        requestId,
        codeHash: this.digest(id, purpose, requestId, code),
        expiresAt,
        consumedAt: null,
        issuedAt: new Date(),
        issueCount: count + 1,
        issueWindowEndsAt: count
          ? old?.issueWindowEndsAt
          : new Date(now + 3600000),
      });
      await this.audit.record(c, a.userId, 'deliveries.contact_code_requested');
      return {
        requestId,
        deliveryId: id,
        purpose,
        phone: purpose === 'HANDOVER' ? d.recipientPhone : d.senderPhone,
        code,
        expiresAt,
      };
    });
    try {
      await this.delivery.send(message);
    } catch {
      await this.tx.run((c) =>
        this.repo.invalidateProof(
          c,
          id,
          purpose,
          this.digest(id, purpose, message.requestId, message.code),
        ),
      );
      throw new ApiError(
        'CONTACT_DELIVERY_UNAVAILABLE',
        503,
        'Code delivery is unavailable; retry later',
        60,
      );
    }
    return {
      requestId: message.requestId,
      purpose,
      expiresAt: message.expiresAt,
    };
  }
  /** Return failure instead of throwing inside the transaction: failed attempts must commit. */
  async verify(
    c: TransactionContext,
    d: DeliveryRecord,
    purpose: ProofPurpose,
    code: string,
  ): Promise<boolean> {
    const old = await this.repo.proof(c, d.id, purpose),
      now = Date.now(),
      failures =
        old?.failureWindowEndsAt && old.failureWindowEndsAt.getTime() > now
          ? old.failureCount
          : 0;
    if (failures >= 5) return false;
    const hash = old?.requestId
      ? this.digest(d.id, purpose, old.requestId, code)
      : null;
    const valid = !!(
      hash &&
      old?.codeHash &&
      old.expiresAt &&
      old.expiresAt.getTime() > now &&
      !old.consumedAt &&
      timingSafeEqual(Buffer.from(hash), Buffer.from(old.codeHash))
    );
    if (!valid) {
      await this.repo.updateProof(c, d.id, purpose, {
        failureCount: failures + 1,
        failureWindowEndsAt: failures
          ? old?.failureWindowEndsAt
          : new Date(now + 900000),
      });
      return false;
    }
    await this.repo.updateProof(c, d.id, purpose, {
      consumedAt: new Date(),
      codeHash: null,
    });
    return true;
  }
}
