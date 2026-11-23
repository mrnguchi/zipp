import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { DeliveryAccessService } from './delivery-access.service.js';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import type { DeliveryRecord } from '../contracts/delivery-contracts.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
export function deliveryView(d: DeliveryRecord, userId: string) {
  const booker = d.bookerUserId === userId,
    courier = d.courierUserId === userId && !d.completedAt;
  return {
    id: d.id,
    status: d.status,
    custody: d.custody,
    version: d.version,
    viewerRole: booker
      ? 'BOOKER'
      : d.courierUserId === userId
        ? 'COURIER'
        : d.senderUserId === userId
          ? 'SENDER'
          : 'RECIPIENT',
    perspective: d.perspective,
    serviceClass: d.serviceClass,
    sender: {
      name: d.senderName,
      phone:
        booker || courier || d.senderUserId === userId ? d.senderPhone : null,
    },
    recipient: {
      name: d.recipientName,
      phone:
        booker || courier || d.recipientUserId === userId
          ? d.recipientPhone
          : null,
    },
    package: {
      description: d.packageDescription,
      size: d.packageSize,
      weightGrams: d.packageWeightGrams,
      photoId:
        d.courierUserId === userId && d.completedAt ? null : d.packagePhotoId,
    },
    pickup: { latitude: d.pickupLatitude, longitude: d.pickupLongitude },
    destination: {
      latitude: d.destinationLatitude,
      longitude: d.destinationLongitude,
    },
    ...(booker
      ? {
          currency: 'XAF',
          quotedAmountXaf: d.quotedAmountXaf.toString(),
          cancellationFeeXaf: d.cancellationFeeXaf.toString(),
          chargedAmountXaf: d.chargedAmountXaf.toString(),
          refundedAmountXaf: d.refundedAmountXaf.toString(),
        }
      : {}),
    createdAt: d.createdAt,
    assignedAt: d.assignedAt,
    collectedAt: d.collectedAt,
    completedAt: d.completedAt,
  };
}
@Injectable()
export class DeliveryReadService {
  constructor(
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
    @Inject(DeliveryAccessService)
    private readonly access: DeliveryAccessService,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
  ) {}
  async snapshot(a: Actor, id: string) {
    return this.tx.run(async (c) =>
      deliveryView(await this.access.authorize(c, a, id), a.userId),
    );
  }
  async history(a: Actor, limit: number, cursor?: string) {
    await this.tx.run((c) => this.access.identity.authorize(c, a));
    const rows = await this.repo.list(a.userId, limit, cursor);
    return {
      items: rows.map((d) => deliveryView(d, a.userId)),
      nextCursor: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
    };
  }
  async active(a: Actor) {
    await this.tx.run((c) => this.access.identity.authorize(c, a));
    return {
      items: (await this.repo.active(a.userId)).map((d) =>
        deliveryView(d, a.userId),
      ),
    };
  }
  async events(a: Actor, id: string, after: number) {
    await this.tx.run((c) => this.access.authorize(c, a, id));
    const rows = await this.repo.events(id, after);
    return { items: rows, nextVersion: rows.at(-1)?.aggregateVersion ?? after };
  }
  async issues(a: Actor, id: string) {
    await this.tx.run((c) => this.access.authorize(c, a, id));
    return {
      items: (await this.repo.issues(id)).map((i) => ({
        id: i.id,
        kind: i.kind,
        reason: i.reason,
        resolution: i.resolution,
        resolutionReason: i.resolutionReason,
        createdAt: i.createdAt,
        resolvedAt: i.resolvedAt,
      })),
    };
  }
  async receipt(a: Actor, id: string) {
    const d = await this.tx.run((c) => this.access.authorize(c, a, id));
    if (d.bookerUserId !== a.userId || !d.completedAt)
      throw new BusinessError('NOT_FOUND', 'Terminal booker receipt not found');
    return {
      deliveryId: id,
      currency: 'XAF',
      quotedAmountXaf: d.quotedAmountXaf.toString(),
      chargedAmountXaf: d.chargedAmountXaf.toString(),
      refundedAmountXaf: d.refundedAmountXaf.toString(),
      netAmountXaf: (d.chargedAmountXaf - d.refundedAmountXaf).toString(),
      status: d.status,
      completedAt: d.completedAt,
      rating: await this.repo.rating(id),
    };
  }
  async tracking(a: Actor, id: string) {
    return this.tx.run(async (c) => {
      const d = await this.access.authorize(c, a, id);
      let position = null;
      if (!d.completedAt && d.courierUserId) {
        try {
          const p =
            d.custody === 'WITH_COURIER'
              ? await this.access.drivers.custodyPosition(c, d.courierUserId)
              : (
                  await this.access.drivers.trackingPosition(
                    c,
                    d.courierUserId,
                    d.serviceClass,
                  )
                ).position;
          position = {
            latitude: p.latitude,
            longitude: p.longitude,
            receivedAt: p.receivedAt,
            stale:
              !!p.receivedAt && Date.now() - p.receivedAt.getTime() > 15000,
          };
        } catch (e) {
          if (!(e instanceof BusinessError)) throw e;
        }
      }
      return {
        deliveryId: id,
        status: d.status,
        custody: d.custody,
        version: d.version,
        position,
      };
    });
  }
}
