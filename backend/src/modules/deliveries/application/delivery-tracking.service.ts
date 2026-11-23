import { timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import { deliveryCapabilityBody } from '../contracts/delivery.schemas.js';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { DeliveryAccessService } from './delivery-access.service.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { DeliveriesConfig } from '../deliveries.config.js';
@Injectable()
export class DeliveryTrackingService {
  constructor(
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
    @Inject(DeliveryAccessService)
    private readonly access: DeliveryAccessService,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {}
  async issue(
    a: Actor,
    id: string,
    input: z.infer<typeof deliveryCapabilityBody>,
  ) {
    this.config.assertEnabled();
    return this.tx.run(async (c) => {
      const { delivery: d } = await this.access.lock(c, a, id);
      if (d.bookerUserId !== a.userId || d.completedAt)
        throw new BusinessError(
          'FORBIDDEN',
          'Only the booker may share active tracking',
        );
      const capId = input.id.toLowerCase(),
        token = `${capId}.${input.secret}`,
        hash = this.access.identity.pseudonym('delivery-tracking', token);
      const existing = await this.repo.capability(capId, c);
      if (existing) {
        if (
          existing.deliveryId !== id ||
          existing.issuedById !== a.userId ||
          existing.tokenHash !== hash ||
          existing.requestedTtlSeconds !== input.ttlSeconds
        )
          throw new BusinessError(
            'IDEMPOTENCY_CONFLICT',
            'Capability identity has different input',
          );
        return {
          id: existing.id,
          expiresAt: existing.expiresAt,
          revokedAt: existing.revokedAt,
        };
      }
      const rows = await this.repo.capabilities(id, c);
      if (
        rows.length >= 20 ||
        rows.filter((r) => !r.revokedAt && r.expiresAt > new Date()).length >= 5
      )
        throw new BusinessError(
          'TRACKING_LIMIT',
          'Revoke an active capability or finish the delivery',
        );
      const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
      await this.repo.createCapability(c, id, {
        id: capId,
        issuedById: a.userId,
        tokenHash: hash,
        requestedTtlSeconds: input.ttlSeconds,
        expiresAt,
      });
      await this.audit.record(c, a.userId, 'deliveries.tracking_shared');
      return { id: capId, expiresAt, revokedAt: null };
    });
  }
  async list(a: Actor, id: string) {
    await this.tx.run(async (c) => {
      const d = await this.access.authorize(c, a, id);
      if (d.bookerUserId !== a.userId)
        throw new BusinessError('FORBIDDEN', 'Booker permission required');
    });
    return {
      items: (await this.repo.capabilities(id)).map((r) => ({
        id: r.id,
        expiresAt: r.expiresAt,
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
      })),
    };
  }
  async revoke(a: Actor, id: string, capId: string) {
    return this.tx.run(async (c) => {
      const { delivery: d } = await this.access.lock(c, a, id);
      if (d.bookerUserId !== a.userId)
        throw new BusinessError('FORBIDDEN', 'Booker permission required');
      await this.repo.revokeCapability(c, capId, id);
      await this.audit.record(c, a.userId, 'deliveries.tracking_revoked');
      return { revoked: true };
    });
  }
  async publicView(authorization: unknown) {
    this.config.assertEnabled();
    if (
      typeof authorization !== 'string' ||
      !/^Bearer [a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(
        authorization,
      )
    )
      throw new BusinessError('NOT_FOUND', 'Tracking unavailable');
    const token = authorization.slice(7),
      id = token.slice(0, 36);
    return this.tx.run(async (c) => {
      const initial = await this.repo.capability(id, c);
      if (!initial)
        throw new BusinessError('NOT_FOUND', 'Tracking unavailable');
      const d = await this.repo.get(initial.deliveryId, c);
      if (!d) throw new BusinessError('NOT_FOUND', 'Tracking unavailable');
      // User lock serializes booker revocation/completion against a tracking snapshot.
      await this.access.identity.lockUsers(c, [
        d.bookerUserId,
        ...(d.courierUserId ? [d.courierUserId] : []),
      ]);
      const cap = await this.repo.capability(id, c),
        current = await this.repo.get(d.id, c);
      const hash = this.access.identity.pseudonym('delivery-tracking', token);
      if (
        !cap ||
        !current ||
        cap.revokedAt ||
        cap.expiresAt <= new Date() ||
        !timingSafeEqual(Buffer.from(cap.tokenHash), Buffer.from(hash))
      )
        throw new BusinessError('NOT_FOUND', 'Tracking unavailable');
      let position = null;
      if (
        current.custody === 'WITH_COURIER' &&
        !current.completedAt &&
        current.courierUserId === d.courierUserId &&
        current.courierUserId
      ) {
        try {
          const p = await this.access.drivers.custodyPosition(
            c,
            current.courierUserId,
          );
          if (p.latitude !== null && p.longitude !== null)
            position = {
              latitude: Number(p.latitude.toFixed(3)),
              longitude: Number(p.longitude.toFixed(3)),
              receivedAt: p.receivedAt,
            };
        } catch (e) {
          if (!(e instanceof BusinessError)) throw e;
        }
      }
      return {
        status: current.status,
        custody: current.custody,
        updatedVersion: current.version,
        createdAt: current.createdAt,
        completedAt: current.completedAt,
        position,
      };
    });
  }
}
