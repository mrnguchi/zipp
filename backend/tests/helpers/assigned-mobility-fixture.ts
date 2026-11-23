import { randomUUID, randomInt } from 'node:crypto';
import type { Actor } from '../../src/shared/contracts/actor.js';
import type { DatabaseService } from '../../src/platform/database/database.service.js';
import type { DatabaseUnitOfWork } from '../../src/platform/database/database-unit-of-work.js';
import type { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import type { JobsFacade } from '../../src/modules/jobs/jobs.facade.js';
import type { FinanceFacade } from '../../src/modules/finance/finance.facade.js';
import type { PricingService } from '../../src/modules/pricing/application/pricing.service.js';
import type { PricingFacade } from '../../src/modules/pricing/pricing.facade.js';
import { PrismaRideRepository } from '../../src/modules/rides/infrastructure/prisma-ride.repository.js';
import { PrismaDeliveryRepository } from '../../src/modules/deliveries/infrastructure/prisma-delivery.repository.js';
type Dependencies = {
  db: DatabaseService;
  transactions: DatabaseUnitOfWork;
  identity: IdentityFacade;
  jobs: JobsFacade;
  finance: FinanceFacade;
  pricing: PricingFacade;
  pricingService: PricingService;
};
/** A bare job is invalid after M6: fixtures must satisfy deferred aggregate/event/hold guards. */
export async function assignedMobilityFixture(
  deps: Dependencies,
  owner: Actor,
  driver: Actor,
  kind: 'RIDE' | 'DELIVERY',
) {
  const { db, transactions, identity, jobs, finance, pricing, pricingService } =
    deps;
  const q = await pricingService.create(owner, randomUUID(), {
    serviceAreaId: '00000000-0000-4000-8000-000000000004',
    serviceClass: kind === 'RIDE' ? 'EVERYDAY' : 'DELIVERY_STANDARD',
    pickup: { latitude: 4.05, longitude: 9.7 },
    destination: { latitude: 4.06, longitude: 9.72 },
  });
  const id = randomUUID(),
    rides = new PrismaRideRepository(db, transactions),
    deliveries = new PrismaDeliveryRepository(db, transactions);
  await transactions.run(async (c) => {
    await identity.authorize(c, owner, [], false, [driver.userId]);
    const quote = await pricing.consumeQuote(
        c,
        owner,
        q.id,
        `${kind.toLowerCase()}:${id}`,
      ),
      terms = await pricing.bookingTerms(c, quote.id),
      area = terms.serviceArea;
    await jobs.create(c, id, owner.userId, kind);
    const hold = await finance.reserveFunds(
      c,
      owner,
      `${kind.toLowerCase()}:${id}`,
      quote.totalAmountXaf.toString(),
    );
    const base = {
      id,
      quoteId: quote.id,
      reservationId: hold.id,
      serviceAreaId: area.id,
      serviceClass: quote.serviceClass,
      quotedAmountXaf: quote.totalAmountXaf,
      commissionBps: terms.commissionBps,
      cancellationFeeXaf: terms.cancellationFeeXaf,
      pricingPolicyVersion: terms.version,
      pickupLatitude: quote.pickupLatitude,
      pickupLongitude: quote.pickupLongitude,
      destinationLatitude: quote.destinationLatitude,
      destinationLongitude: quote.destinationLongitude,
      distanceMeters: quote.distanceMeters,
      durationSeconds: quote.durationSeconds,
    };
    const bounds = {
      minimumLatitude: area.minimumLatitude,
      maximumLatitude: area.maximumLatitude,
      minimumLongitude: area.minimumLongitude,
      maximumLongitude: area.maximumLongitude,
    };
    if (kind === 'RIDE') {
      await rides.create(c, { ...base, customerUserId: owner.userId }, bounds);
      await jobs.claim(c, id, driver.userId);
      await rides.transition(
        c,
        id,
        {
          status: 'ASSIGNED',
          driverUserId: driver.userId,
          assignedAt: new Date(),
        },
        'ride.assigned',
      );
      await rides.stopTask(c, id);
    } else {
      const p = await transactions.client(c).deliveryPackagePhoto.create({
        data: {
          ownerUserId: owner.userId,
          status: 'STORED',
          objectKey: randomUUID(),
          contentType: 'image/jpeg',
          byteLength: 16,
          contentSha256: 'b'.repeat(64),
          uploadExpiresAt: new Date(Date.now() + 600000),
        },
      });
      const phone = await identity.actorPhone(c, owner);
      await deliveries.create(
        c,
        {
          ...base,
          bookerUserId: owner.userId,
          senderUserId: owner.userId,
          recipientUserId: null,
        },
        {
          quoteId: q.id,
          perspective: 'SENDING',
          sender: { name: 'Isolated Sender', phone },
          recipient: {
            name: 'Isolated Guest',
            phone: `+2376${randomInt(10000000, 100000000)}`,
          },
          package: {
            description: 'Isolated fixture package',
            size: 'SMALL',
            weightGrams: 500,
            photoId: p.id,
          },
          contactSharingConsent: true,
          acceptTerms: true,
        },
        bounds,
      );
      await jobs.claim(c, id, driver.userId);
      await deliveries.transition(
        c,
        id,
        {
          status: 'ASSIGNED',
          courierUserId: driver.userId,
          assignedAt: new Date(),
        },
        'delivery.assigned',
      );
      await deliveries.stopTask(c, id);
    }
  });
  return {
    id,
    async close() {
      await transactions.run(async (c) => {
        await identity.lockUsers(c, [owner.userId, driver.userId]);
        await jobs.lock(c, id);
        const row =
          kind === 'RIDE'
            ? await rides.ride(id, c)
            : await deliveries.get(id, c);
        if (!row || row.completedAt) return;
        await finance.releaseFunds(c, row.reservationId);
        await jobs.close(c, id);
        const patch = {
          status: 'CANCELLED' as const,
          completedAt: new Date(),
          cancellationReason: 'Isolated assigned fixture cleanup',
        };
        if (kind === 'RIDE')
          await rides.transition(c, id, patch, 'ride.fixture_cleanup');
        else
          await deliveries.transition(c, id, patch, 'delivery.fixture_cleanup');
      });
    },
  };
}
