import { DeliveryLiveService } from '../../src/modules/deliveries/application/delivery-live.service.js';
import { createHash } from 'node:crypto';
import { DeliveryPhotoService } from '../../src/modules/deliveries/application/delivery-photo.service.js';
import { LocalPackagePhotos } from '../../src/modules/deliveries/infrastructure/local-delivery.providers.js';
import { assignedMobilityFixture } from '../helpers/assigned-mobility-fixture.js';
import 'reflect-metadata';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { parseEnvironment } from '../../src/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  DatabaseUnitOfWork,
  DatabaseAudit,
} from '../../src/platform/database/database-unit-of-work.js';
import { PrismaIdentityRepository } from '../../src/modules/identity/infrastructure/prisma-identity.repository.js';
import { NodeIdentityCrypto } from '../../src/modules/identity/infrastructure/identity-crypto.js';
import { SessionService } from '../../src/modules/identity/application/session.service.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { identityTestConfig } from '../helpers/identity-config.js';
import { PrismaJobsRepository } from '../../src/modules/jobs/infrastructure/prisma-jobs.repository.js';
import { JobsFacade } from '../../src/modules/jobs/jobs.facade.js';
import { PrismaDriverRepository } from '../../src/modules/drivers/infrastructure/prisma-driver.repository.js';
import { DriverService } from '../../src/modules/drivers/application/driver.service.js';
import { DriversFacade } from '../../src/modules/drivers/drivers.facade.js';
import { PrismaPricingRepository } from '../../src/modules/pricing/infrastructure/prisma-pricing.repository.js';
import { PricingConfig } from '../../src/modules/pricing/pricing.config.js';
import { FixtureRoutingProvider } from '../../src/modules/pricing/infrastructure/fixture-routing.provider.js';
import { PricingService } from '../../src/modules/pricing/application/pricing.service.js';
import { PricingFacade } from '../../src/modules/pricing/pricing.facade.js';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository.js';
import { WalletService } from '../../src/modules/finance/application/wallet.service.js';
import { FinancialRequestService } from '../../src/modules/finance/application/financial-request.service.js';
import { PaymentService } from '../../src/modules/finance/application/payment.service.js';
import { PaymentExecutionService } from '../../src/modules/finance/application/payment-execution.service.js';
import { LocalPaymentProvider } from '../../src/modules/finance/infrastructure/local-payment.provider.js';
import { FinanceConfig } from '../../src/modules/finance/finance.config.js';
import { FinanceFacade } from '../../src/modules/finance/finance.facade.js';
import { CLEARING_ACCOUNT_ID } from '../../src/modules/finance/contracts/finance-contracts.js';
import { PrismaDeliveryRepository } from '../../src/modules/deliveries/infrastructure/prisma-delivery.repository.js';
import { DeliveryRequestService } from '../../src/modules/deliveries/application/delivery-request.service.js';
import { DeliveryAccessService } from '../../src/modules/deliveries/application/delivery-access.service.js';
import { DeliveryBookingService } from '../../src/modules/deliveries/application/delivery-booking.service.js';
import { DeliveryCodeService } from '../../src/modules/deliveries/application/delivery-code.service.js';
import { DeliveryDispatchService } from '../../src/modules/deliveries/application/delivery-dispatch.service.js';
import { DeliveryOfferService } from '../../src/modules/deliveries/application/delivery-offer.service.js';
import { DeliveryLifecycleService } from '../../src/modules/deliveries/application/delivery-lifecycle.service.js';
import { DeliveryReadService } from '../../src/modules/deliveries/application/delivery-read.service.js';
import { DeliveryReviewService } from '../../src/modules/deliveries/application/delivery-review.service.js';
import { DeliveryTrackingService } from '../../src/modules/deliveries/application/delivery-tracking.service.js';
import { ContactCodeDelivery } from '../../src/modules/deliveries/application/delivery-providers.port.js';
import type { ContactCodeMessage } from '../../src/modules/deliveries/application/delivery-providers.port.js';
import { DeliveriesConfig } from '../../src/modules/deliveries/deliveries.config.js';
import { deliveryTerminal } from '../../src/modules/deliveries/domain/delivery-rules.js';
import type { ProofPurpose } from '../../src/modules/deliveries/contracts/delivery.schemas.js';
import type { Actor } from '../../src/shared/contracts/actor.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';

// Written source only (ADR 0003). Run on explicit command against isolated zipp_test.
// PostgreSQL proves custody/assignment/money races; these doubles do not prove Redis limits or SMS.
class AdmissionDouble extends RateLimitPort {
  consume() {
    return Promise.resolve();
  }
}
/** Captures codes in memory so the suite never reads the developer mailbox. */
class CapturedCodes extends ContactCodeDelivery {
  readonly messages: ContactCodeMessage[] = [];
  send(message: ContactCodeMessage) {
    this.messages.push(message);
    return Promise.resolve();
  }
}
class UnavailableCodes extends ContactCodeDelivery {
  readonly attempted: ContactCodeMessage[] = [];
  send(message: ContactCodeMessage) {
    this.attempted.push(message);
    return Promise.reject(new Error('Isolated provider outage'));
  }
}
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error('Explicitly authorized isolated service tests required');
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test')
  throw new Error('Delivery integration requires zipp_test');

const AREA_ID = '00000000-0000-4000-8000-000000000004';
const PICKUP = { latitude: 4.05, longitude: 9.7 };
const DESTINATION = { latitude: 4.06, longitude: 9.72 };

describe('M6 real database custody, assignment and money invariants', () => {
  const db = new DatabaseService(config),
    transactions = new DatabaseUnitOfWork(db),
    audit = new DatabaseAudit(transactions);
  const identityRepository = new PrismaIdentityRepository(db, transactions),
    crypto = new NodeIdentityCrypto(identityTestConfig()),
    identity = new IdentityFacade(
      new SessionService(identityRepository, crypto, transactions, audit),
      crypto,
      identityRepository,
    );
  const jobs = new JobsFacade(new PrismaJobsRepository(transactions, db));
  const driverRepository = new PrismaDriverRepository(db, transactions),
    drivers = new DriversFacade(
      new DriverService(driverRepository, identity, transactions, audit, jobs),
      driverRepository,
      identity,
      jobs,
    );
  const priceConfig = new PricingConfig({
      NODE_ENV: 'test',
      PRICING_ENABLED: 'true',
      ROUTING_ADAPTER: 'fixture',
    }),
    pricingService = new PricingService(
      new PrismaPricingRepository(db, transactions),
      new FixtureRoutingProvider(priceConfig),
      priceConfig,
      identity,
      transactions,
      audit,
    ),
    pricing = new PricingFacade(pricingService);
  const financeRepository = new PrismaFinanceRepository(db, transactions),
    wallets = new WalletService(financeRepository),
    payConfig = new FinanceConfig({
      NODE_ENV: 'test',
      PAYMENTS_ENABLED: 'true',
      PAYMENT_ADAPTER: 'local',
    });
  const finance = new FinanceFacade(
    wallets,
    new PaymentService(
      financeRepository,
      new FinancialRequestService(financeRepository),
      wallets,
      payConfig,
      transactions,
      audit,
    ),
    new PaymentExecutionService(
      financeRepository,
      new LocalPaymentProvider(payConfig),
      wallets,
      transactions,
      audit,
    ),
    financeRepository,
    jobs,
  );
  const deliveryConfig = new DeliveriesConfig({
    NODE_ENV: 'test',
    DELIVERIES_ENABLED: 'true',
    DELIVERY_CODE_ADAPTER: 'local',
    DELIVERY_MEDIA_ENABLED: 'true',
    DELIVERY_MEDIA_ADAPTER: 'local',
    DELIVERY_MEDIA_ROOT: mkdtempSync(join(tmpdir(), 'zipp-m6-photos-')),
  });
  const repository = new PrismaDeliveryRepository(db, transactions),
    requests = new DeliveryRequestService(repository),
    access = new DeliveryAccessService(repository, identity, drivers, jobs),
    captured = new CapturedCodes(),
    codes = new DeliveryCodeService(
      repository,
      access,
      captured,
      identity,
      transactions,
      audit,
      deliveryConfig,
    );
  const booking = new DeliveryBookingService(
      repository,
      requests,
      identity,
      jobs,
      pricing,
      finance,
      transactions,
      audit,
      new AdmissionDouble(),
      deliveryConfig,
    ),
    dispatch = new DeliveryDispatchService(
      repository,
      identity,
      drivers,
      jobs,
      pricing,
      finance,
      transactions,
      audit,
    ),
    offers = new DeliveryOfferService(
      repository,
      requests,
      identity,
      drivers,
      jobs,
      pricing,
      transactions,
      audit,
      deliveryConfig,
    ),
    lifecycle = new DeliveryLifecycleService(
      repository,
      access,
      requests,
      codes,
      finance,
      transactions,
      audit,
      deliveryConfig,
    ),
    reads = new DeliveryReadService(repository, access, transactions),
    reviews = new DeliveryReviewService(
      repository,
      access,
      requests,
      finance,
      transactions,
      audit,
      deliveryConfig,
    ),
    tracking = new DeliveryTrackingService(
      repository,
      access,
      transactions,
      audit,
      deliveryConfig,
    );

  const users: Actor[] = [],
    phones = new Map<string, string>(),
    deliveryIds: string[] = [],
    extraJobs: { close(): Promise<void> }[] = [];
  beforeAll(() => db.onModuleInit());
  afterEach(async () => {
    const ids = await jobs.freeDriverIds(
      users.filter((u) => u.roles.includes('DRIVER')).map((u) => u.userId),
    );
    await db.client.driverPresence.updateMany({
      where: { application: { ownerUserId: { in: ids } } },
      data: { online: false },
    });
  });
  afterAll(async () => {
    try {
      // Cleanup only pre-custody fixtures through the normal forward transition.
      // Collected packages intentionally have no shortcut: they stay held in zipp_test.
      for (const id of deliveryIds)
        await transactions.run(async (context) => {
          const d = await repository.get(id, context);
          if (!d || deliveryTerminal(d.status) || d.custody !== 'WITH_SENDER')
            return;
          await identity.lockUsers(context, [
            d.bookerUserId,
            ...[d.senderUserId, d.recipientUserId, d.courierUserId].filter(
              (v): v is string => !!v,
            ),
          ]);
          await jobs.lock(context, id);
          await repository.lock(context, id);
          await finance.releaseFunds(context, d.reservationId);
          await jobs.close(context, id);
          await repository.stopTask(context, id);
          await repository.withdrawOffers(context, id);
          await repository.transition(
            context,
            id,
            {
              status: 'CANCELLED',
              completedAt: new Date(),
              cancellationReason: 'Isolated fixture cleanup',
            },
            'delivery.fixture_cleanup',
          );
        });
      for (const fixture of extraJobs) await fixture.close();
      for (const user of users) {
        await db.client.authSession.updateMany({
          where: { userId: user.userId },
          data: { revokedAt: new Date() },
        });
        await db.client.user.update({
          where: { id: user.userId },
          data: {
            status: 'DELETION_REQUESTED',
            deletionRequestedAt: new Date(),
          },
        });
      }
    } finally {
      await db.onModuleDestroy();
    }
  });

  async function actor(
    role: 'CUSTOMER' | 'DRIVER' | 'ADMIN' = 'CUSTOMER',
    providedPhone?: string,
  ): Promise<Actor> {
    const phone = providedPhone ?? `+2376${randomInt(10000000, 100000000)}`;
    const u = await db.client.user.create({
      data: {
        phone,
        status: 'ACTIVE',
        passwordHash: 'isolated-no-password-login',
        phoneVerifiedAt: new Date(),
        roles: role === 'DRIVER' ? ['CUSTOMER', 'DRIVER'] : [role],
        twoFactorSecret:
          role === 'ADMIN' ? 'isolated-enrollment-presence' : null,
      },
    });
    const s = await db.client.authSession.create({
      data: {
        userId: u.id,
        expiresAt: new Date(Date.now() + 3600000),
        mfaVerifiedAt: role === 'ADMIN' ? new Date() : null,
      },
    });
    const result = {
      userId: u.id,
      sessionId: s.id,
      roles: u.roles,
      mfaEnabled: role === 'ADMIN',
      mfaVerifiedAt: s.mfaVerifiedAt,
    };
    users.push(result);
    phones.set(u.id, phone);
    if (role === 'DRIVER') {
      const app = await db.client.driverApplication.create({
        data: {
          ownerUserId: u.id,
          status: 'APPROVED',
          approvedClasses: ['DELIVERY_STANDARD', 'DELIVERY_EXPRESS'],
          vehicle: {
            create: {
              registrationPlate: `TEST ${randomInt(100000, 999999)}`,
              manufacturer: 'Fixture',
              model: 'Motorcycle',
              color: 'Red',
              manufactureYear: 2021,
              seatCount: 2,
            },
          },
        },
      });
      for (const kind of [
        'IDENTITY',
        'LICENSE',
        'VEHICLE_REGISTRATION',
        'INSURANCE',
      ] as const)
        await db.client.driverDocument.create({
          data: {
            driverApplicationId: app.id,
            applicationRevision: 1,
            kind,
            status: 'APPROVED',
            contentType: 'application/pdf',
            byteLength: 20,
            contentSha256: 'a'.repeat(64),
            objectKey: randomUUID(),
            uploadExpiresAt: new Date(Date.now() + 600000),
            documentExpiresAt: new Date(Date.now() + 86400000),
          },
        });
      // Prevalidated location fixtures isolate SQL lifecycle races, not native/background transport.
      await db.client.driverPresence.create({
        data: {
          driverApplicationId: app.id,
          authSessionId: s.id,
          locationSessionId: randomUUID(),
          online: true,
          sessionExpiresAt: new Date(Date.now() + 3600000),
          sequence: 1,
          latitude: PICKUP.latitude,
          longitude: PICKUP.longitude,
          accuracyMeters: 10,
          capturedAt: new Date(),
          receivedAt: new Date(),
        },
      });
    }
    return result;
  }
  function phoneOf(user: Actor) {
    const phone = phones.get(user.userId);
    if (!phone) throw new Error('Missing fixture phone');
    return phone;
  }
  async function seed(owner: Actor) {
    await transactions.run(async (context) => {
      const wallet = await financeRepository.wallet(context, owner.userId);
      await financeRepository.lockAccounts(context, [
        wallet.id,
        CLEARING_ACCOUNT_ID,
      ]);
      await financeRepository.post(
        context,
        `fixture:${randomUUID()}`,
        'Isolated delivery fixture',
        [
          { walletAccountId: wallet.id, amountXaf: 20000n },
          { walletAccountId: CLEARING_ACCOUNT_ID, amountXaf: -20000n },
        ],
      );
    });
  }
  /** Stored-photo row only: byte/signature/storage transport is a separate, unverified gate. */
  async function photo(owner: Actor) {
    return db.client.deliveryPackagePhoto.create({
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
  }
  async function quote(owner: Actor) {
    return pricingService.create(owner, randomUUID(), {
      serviceAreaId: AREA_ID,
      serviceClass: 'DELIVERY_STANDARD',
      pickup: PICKUP,
      destination: DESTINATION,
    });
  }
  function input(
    quoteId: string,
    photoId: string,
    sender: { name: string; phone: string },
    recipient: { name: string; phone: string },
    perspective: 'SENDING' | 'RECEIVING' = 'SENDING',
  ) {
    return {
      quoteId,
      perspective,
      sender,
      recipient,
      package: {
        description: 'Isolated fixture documents',
        size: 'SMALL' as const,
        weightGrams: 500,
        photoId,
      },
      contactSharingConsent: true as const,
      acceptTerms: true as const,
    };
  }
  /** SENDING booking by `owner` to a guest recipient phone that no fixture account owns. */
  async function book(owner: Actor, recipientPhone?: string) {
    await seed(owner);
    const q = await quote(owner),
      p = await photo(owner);
    const d = await booking.book(
      owner,
      randomUUID(),
      input(
        q.id,
        p.id,
        { name: 'Fixture Sender', phone: phoneOf(owner) },
        {
          name: 'Fixture Recipient',
          phone: recipientPhone ?? `+2376${randomInt(10000000, 100000000)}`,
        },
      ),
    );
    deliveryIds.push(d.id);
    return d;
  }
  async function offered(courier: Actor, id: string) {
    const offer = (await repository.courierOffers(courier.userId)).find(
      (row) => row.deliveryId === id,
    );
    if (!offer) throw new Error('Fixture courier was not offered the delivery');
    return offer;
  }
  async function move(
    courier: Actor,
    to: { latitude: number; longitude: number },
  ) {
    const app = await driverRepository.findOwner(courier.userId);
    if (!app) throw new Error('Missing fixture courier');
    await db.client.driverPresence.update({
      where: { driverApplicationId: app.id },
      data: {
        latitude: to.latitude,
        longitude: to.longitude,
        capturedAt: new Date(),
        receivedAt: new Date(),
        sequence: { increment: 1 },
      },
    });
  }
  function lastCode(id: string, purpose: ProofPurpose) {
    const message = [...captured.messages]
      .reverse()
      .find((m) => m.deliveryId === id && m.purpose === purpose);
    if (!message) throw new Error('No captured fixture code');
    return message;
  }
  async function assigned() {
    const booker = await actor(),
      courier = await actor('DRIVER'),
      d = await book(booker);
    await dispatch.execute(d.id);
    const offer = await offered(courier, d.id);
    await offers.respond(courier, randomUUID(), offer.id, true);
    return { booker, courier, delivery: d };
  }
  async function collected() {
    const f = await assigned();
    await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'ARRIVE_PICKUP',
    );
    await codes.issue(f.courier, f.delivery.id, 'PICKUP');
    await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'COLLECT',
      lastCode(f.delivery.id, 'PICKUP').code,
    );
    return f;
  }
  async function atDestination() {
    const f = await collected();
    await lifecycle.advance(f.courier, randomUUID(), f.delivery.id, 'TRANSIT');
    await move(f.courier, DESTINATION);
    await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'ARRIVE_DESTINATION',
    );
    return f;
  }
  const reserved = async (user: Actor) =>
    (await financeRepository.balance(user.userId))?.reservedAmountXaf;

  it('rejects one phone for both contacts and identity mismatch without consuming the quote', async () => {
    const booker = await actor();
    await seed(booker);
    const q = await quote(booker),
      p = await photo(booker),
      own = { name: 'Same Person', phone: phoneOf(booker) };
    await expect(
      booking.book(booker, randomUUID(), input(q.id, p.id, own, own)),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const stranger = { name: 'Not The Booker', phone: '+237699000001' };
    await expect(
      booking.book(
        booker,
        randomUUID(),
        input(q.id, p.id, stranger, own, 'SENDING'),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await pricingService.get(booker, q.id)).consumedAt).toBeNull();
    expect(await repository.active(booker.userId)).toHaveLength(0);
    expect(await reserved(booker)).toBe(0n);
  });

  it('assigns one delivery to one courier under concurrent acceptance and never offers to contacts', async () => {
    const booker = await actor('DRIVER'),
      a = await actor('DRIVER'),
      b = await actor('DRIVER'),
      d = await book(booker);
    await dispatch.execute(d.id);
    expect(
      (await repository.courierOffers(booker.userId)).some(
        (o) => o.deliveryId === d.id,
      ),
    ).toBe(false);
    const listed = await offers.list(a);
    const view = listed.items.find((o) => o.deliveryId === d.id);
    // Offers carry no contacts, destination, photo or proof material.
    expect(view && Object.keys(view).sort()).toEqual(
      [
        'deliveryId',
        'expiresAt',
        'id',
        'packageSize',
        'packageWeightGrams',
        'pickup',
        'quotedAmountXaf',
        'serviceClass',
      ].sort(),
    );
    const oa = await offered(a, d.id),
      ob = await offered(b, d.id);
    const results = await Promise.allSettled([
      offers.respond(a, randomUUID(), oa.id, true),
      offers.respond(b, randomUUID(), ob.id, true),
    ]);
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.client.activeJobAssignment.count({
        where: { mobilityJobId: d.id },
      }),
    ).toBe(1);
    expect(await reserved(booker)).toBe(d.quotedAmountXaf);
  });

  it('shares assignment exclusion with rides so a busy courier cannot accept a delivery', async () => {
    const booker = await actor(),
      courier = await actor('DRIVER'),
      d = await book(booker);
    await dispatch.execute(d.id);
    const offer = await offered(courier, d.id);
    const fixture = await assignedMobilityFixture(
      { db, transactions, identity, jobs, finance, pricing, pricingService },
      booker,
      courier,
      'RIDE',
    );
    extraJobs.push(fixture);
    const key = randomUUID();
    await expect(
      offers.respond(courier, key, offer.id, true),
    ).rejects.toMatchObject({ code: 'DRIVER_BUSY' });
    expect((await repository.get(d.id))?.status).toBe('SEARCHING');
  });

  it('completes custody with separate proofs, captures once and releases the assignment', async () => {
    const f = await atDestination();
    expect((await repository.get(f.delivery.id))?.custody).toBe('WITH_COURIER');
    // A PICKUP code can never complete the HANDOVER proof.
    const pickup = lastCode(f.delivery.id, 'PICKUP').code;
    await expect(
      lifecycle.advance(
        f.courier,
        randomUUID(),
        f.delivery.id,
        'DELIVER',
        pickup,
      ),
    ).rejects.toMatchObject({ code: 'DELIVERY_PROOF_INVALID' });
    const acknowledgement = await codes.issue(
      f.courier,
      f.delivery.id,
      'HANDOVER',
    );
    expect(Object.keys(acknowledgement).sort()).toEqual(
      ['expiresAt', 'purpose', 'requestId'].sort(),
    );
    const handover = lastCode(f.delivery.id, 'HANDOVER');
    expect(handover.phone).not.toBe(phoneOf(f.booker));
    const key = randomUUID();
    const done = await lifecycle.advance(
      f.courier,
      key,
      f.delivery.id,
      'DELIVER',
      handover.code,
    );
    expect(done.status).toBe('DELIVERED');
    expect(done.custody).toBe('WITH_RECIPIENT');
    // Identical replay returns the stored outcome without a second capture.
    await lifecycle.advance(
      f.courier,
      key,
      f.delivery.id,
      'DELIVER',
      handover.code,
    );
    expect(
      await db.client.ledgerTransaction.count({
        where: { businessKey: `capture:${f.delivery.reservationId}` },
      }),
    ).toBe(1);
    expect(
      await db.client.activeJobAssignment.findUnique({
        where: { mobilityJobId: f.delivery.id },
      }),
    ).toBeNull();
    expect(await reserved(f.booker)).toBe(0n);
    expect((await repository.get(f.delivery.id))?.chargedAmountXaf).toBe(
      f.delivery.quotedAmountXaf,
    );
  });

  it('commits failed proof counters before rejecting and blocks a correct code after five failures', async () => {
    const f = await atDestination();
    await codes.issue(f.booker, f.delivery.id, 'HANDOVER');
    const good = lastCode(f.delivery.id, 'HANDOVER').code,
      bad = good === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(
        lifecycle.advance(
          f.courier,
          randomUUID(),
          f.delivery.id,
          'DELIVER',
          bad,
        ),
      ).rejects.toMatchObject({ code: 'DELIVERY_PROOF_INVALID' });
    await expect(
      lifecycle.advance(
        f.courier,
        randomUUID(),
        f.delivery.id,
        'DELIVER',
        good,
      ),
    ).rejects.toMatchObject({ code: 'DELIVERY_PROOF_INVALID' });
    const proof = await db.client.deliveryProof.findUniqueOrThrow({
      where: {
        deliveryId_purpose: { deliveryId: f.delivery.id, purpose: 'HANDOVER' },
      },
    });
    expect(proof.failureCount).toBe(5);
    expect(proof.consumedAt).toBeNull();
    expect((await repository.get(f.delivery.id))?.status).toBe(
      'AT_DESTINATION',
    );
  });

  it('invalidates an issued digest when code delivery fails and rate-limits reissue', async () => {
    const f = await assigned();
    await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'ARRIVE_PICKUP',
    );
    const outage = new UnavailableCodes(),
      failing = new DeliveryCodeService(
        repository,
        access,
        outage,
        identity,
        transactions,
        audit,
        deliveryConfig,
      );
    await expect(
      failing.issue(f.courier, f.delivery.id, 'PICKUP'),
    ).rejects.toMatchObject({ code: 'CONTACT_DELIVERY_UNAVAILABLE' });
    const lost = outage.attempted[0]?.code;
    if (!lost) throw new Error('Provider double was not called');
    await expect(
      lifecycle.advance(
        f.courier,
        randomUUID(),
        f.delivery.id,
        'COLLECT',
        lost,
      ),
    ).rejects.toMatchObject({ code: 'DELIVERY_PROOF_INVALID' });
    // Issuance state committed before delivery, so the one-per-minute limit still applies.
    await expect(
      codes.issue(f.courier, f.delivery.id, 'PICKUP'),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect((await repository.get(f.delivery.id))?.custody).toBe('WITH_SENDER');
  });

  it('refuses ordinary cancellation after collection and keeps hold and assignment intact', async () => {
    const f = await collected();
    await expect(
      lifecycle.cancel(
        f.booker,
        randomUUID(),
        f.delivery.id,
        'Cancel isolated collected package',
      ),
    ).rejects.toMatchObject({ code: 'DELIVERY_CUSTODY_REQUIRES_REVIEW' });
    await expect(
      lifecycle.cancel(
        f.courier,
        randomUUID(),
        f.delivery.id,
        'Courier abandons isolated package',
      ),
    ).rejects.toMatchObject({ code: 'DELIVERY_CUSTODY_REQUIRES_REVIEW' });
    expect(await reserved(f.booker)).toBe(f.delivery.quotedAmountXaf);
    expect(
      await db.client.activeJobAssignment.findUnique({
        where: { mobilityJobId: f.delivery.id },
      }),
    ).not.toBeNull();
  });

  it('returns an unreachable-recipient package only through independent admin authorization and sender proof', async () => {
    const f = await collected(),
      admin = await actor('ADMIN');
    await reviews.issue(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'RECIPIENT_UNREACHABLE',
      'Recipient did not answer at isolated destination',
    );
    const [open] = await repository.issues(f.delivery.id);
    if (!open) throw new Error('Missing opened issue');
    // Participants cannot self-authorize a return.
    await expect(
      reviews.resolve(
        f.booker,
        randomUUID(),
        f.delivery.id,
        open.id,
        'Booker attempts self authorization',
        'RELEASE_HOLD',
      ),
    ).rejects.toBeDefined();
    await reviews.resolve(
      admin,
      randomUUID(),
      f.delivery.id,
      open.id,
      'Verified isolated unreachable recipient',
      'RELEASE_HOLD',
    );
    expect((await repository.get(f.delivery.id))?.status).toBe('RETURNING');
    await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'ARRIVE_RETURN',
    );
    await codes.issue(f.courier, f.delivery.id, 'RETURN');
    const returned = await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'RETURN',
      lastCode(f.delivery.id, 'RETURN').code,
    );
    expect(returned.status).toBe('RETURNED');
    expect(returned.custody).toBe('RETURNED_TO_SENDER');
    expect(returned.chargedAmountXaf).toBe(0n);
    expect(await reserved(f.booker)).toBe(0n);
    expect(
      await db.client.activeJobAssignment.findUnique({
        where: { mobilityJobId: f.delivery.id },
      }),
    ).toBeNull();
  });

  it('charges only the snapshotted pre-pickup fee and refunds it once through a reviewed issue', async () => {
    const f = await assigned(),
      admin = await actor('ADMIN');
    const cancelled = await lifecycle.cancel(
      f.booker,
      randomUUID(),
      f.delivery.id,
      'Cancel isolated assigned delivery',
    );
    expect(cancelled.chargedAmountXaf).toBe(500n);
    expect(await reserved(f.booker)).toBe(0n);
    await reviews.issue(
      f.booker,
      randomUUID(),
      f.delivery.id,
      'DISPUTE',
      'Dispute isolated cancellation fee',
    );
    const [open] = await repository.issues(f.delivery.id);
    if (!open) throw new Error('Missing dispute issue');
    await reviews.resolve(
      admin,
      randomUUID(),
      f.delivery.id,
      open.id,
      'Refund verified isolated cancellation charge',
    );
    expect(
      (await financeRepository.balance(f.booker.userId))?.postedAmountXaf,
    ).toBe(20000n);
    await reviews.issue(
      f.booker,
      randomUUID(),
      f.delivery.id,
      'DISPUTE',
      'Second isolated dispute attempt',
    );
    const second = (await repository.issues(f.delivery.id)).find(
      (i) => !i.resolvedAt,
    );
    if (!second) throw new Error('Missing second issue');
    await expect(
      reviews.resolve(
        admin,
        randomUUID(),
        f.delivery.id,
        second.id,
        'Attempt duplicate isolated refund',
      ),
    ).rejects.toMatchObject({ code: 'REFUND_STATE_CONFLICT' });
  });

  it('releases an exhausted search hold once and hides participant tracking from strangers', async () => {
    const booker = await actor(),
      stranger = await actor(),
      d = await book(booker);
    await db.client.delivery.update({
      where: { id: d.id },
      data: { searchExpiresAt: new Date(Date.now() - 1000) },
    });
    await dispatch.execute(d.id);
    await dispatch.execute(d.id);
    expect((await repository.get(d.id))?.status).toBe('NO_COURIER');
    expect(await reserved(booker)).toBe(0n);
    await expect(reads.tracking(stranger, d.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(reads.snapshot(stranger, d.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('limits tracking capabilities to coarse read-only views and honours revocation', async () => {
    const f = await collected();
    const capInput = {
      id: randomUUID(),
      secret: randomBytes(32).toString('base64url'),
      ttlSeconds: 3600,
    };
    const cap = await tracking.issue(f.booker, f.delivery.id, capInput);
    const token = `${capInput.id}.${capInput.secret}`;
    expect(Object.keys(cap).sort()).toEqual(['expiresAt', 'id', 'revokedAt']);
    expect(await tracking.issue(f.booker, f.delivery.id, capInput)).toEqual(
      cap,
    );
    await expect(
      tracking.issue(f.booker, f.delivery.id, {
        ...capInput,
        ttlSeconds: 7200,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const view = await tracking.publicView(`Bearer ${token}`);
    expect(Object.keys(view).sort()).toEqual(
      [
        'completedAt',
        'createdAt',
        'custody',
        'position',
        'status',
        'updatedVersion',
      ].sort(),
    );
    if (view.position) {
      expect(view.position.latitude).toBe(
        Number(view.position.latitude.toFixed(3)),
      );
    }
    await expect(
      tracking.issue(f.courier, f.delivery.id, capInput),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await tracking.revoke(f.booker, f.delivery.id, cap.id);
    await expect(tracking.publicView(`Bearer ${token}`)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const tampered = `${cap.id}.${'A'.repeat(43)}`;
    await expect(
      tracking.publicView(`Bearer ${tampered}`),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('books the receiving perspective with the booker as recipient and an atomic hold', async () => {
    const receiver = await actor(),
      sender = await actor();
    await seed(receiver);
    const q = await quote(receiver),
      p = await photo(receiver),
      key = randomUUID(),
      body = input(
        q.id,
        p.id,
        { name: 'Registered Sender', phone: phoneOf(sender) },
        { name: 'Receiving Booker', phone: phoneOf(receiver) },
        'RECEIVING',
      );
    const d = await booking.book(receiver, key, body);
    deliveryIds.push(d.id);
    expect(d.bookerUserId).toBe(receiver.userId);
    expect(d.recipientUserId).toBe(receiver.userId);
    expect(d.senderUserId).toBe(sender.userId);
    expect(await reserved(receiver)).toBe(d.quotedAmountXaf);
    expect((await booking.book(receiver, key, body)).id).toBe(d.id);
    const senderView = await reads.snapshot(sender, d.id);
    expect(senderView.sender.phone).toBe(phoneOf(sender));
    expect(senderView.recipient.phone).toBeNull();
    expect(senderView).not.toHaveProperty('quotedAmountXaf');
  });
  it('lets only a matching verified late contact claim an unbound slot idempotently', async () => {
    const owner = await actor(),
      guestPhone = `+2376${randomInt(10000000, 100000000)}`,
      d = await book(owner, guestPhone),
      guest = await actor('CUSTOMER', guestPhone),
      stranger = await actor();
    await expect(reads.snapshot(guest, d.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      reviews.claim(stranger, randomUUID(), d.id, 'RECIPIENT'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const key = randomUUID();
    expect(
      (await reviews.claim(guest, key, d.id, 'RECIPIENT')).recipientUserId,
    ).toBe(guest.userId);
    const version = (await repository.get(d.id))?.version;
    await reviews.claim(guest, key, d.id, 'RECIPIENT');
    expect((await repository.get(d.id))?.version).toBe(version);
    await expect(
      reviews.claim(guest, randomUUID(), d.id, 'SENDER'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await reads.snapshot(guest, d.id)).recipient.phone).toBe(
      guestPhone,
    );
    expect((await reads.snapshot(guest, d.id)).sender.phone).toBeNull();
  });
  it('keeps custody location and proven return available after application suspension', async () => {
    const f = await collected(),
      admin = await actor('ADMIN'),
      app = await driverRepository.findOwner(f.courier.userId);
    if (!app) throw Error('Missing courier fixture');
    await new DriverService(
      driverRepository,
      identity,
      transactions,
      audit,
      jobs,
    ).review(admin, app.id, {
      expectedRevision: app.revision,
      decision: 'suspend',
      reason: 'Isolated application suspension during custody',
      approvedClasses: [],
      documentsReviewed: false,
    });
    await expect(offers.list(f.courier)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      lifecycle.custodyLocation(f.booker, f.delivery.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const epoch = await lifecycle.custodyLocation(f.courier, f.delivery.id);
    await lifecycle.custodyLocation(f.courier, f.delivery.id, {
      schemaVersion: 1,
      locationSessionId: epoch.locationSessionId,
      sequence: 1,
      ...PICKUP,
      accuracyMeters: 10,
      capturedAt: new Date().toISOString(),
    });
    await reviews.issue(
      f.booker,
      randomUUID(),
      f.delivery.id,
      'RETURN_REQUEST',
      'Please return the isolated package safely',
    );
    const [issue] = await repository.issues(f.delivery.id);
    if (!issue) throw Error('Missing return issue');
    await reviews.resolve(
      admin,
      randomUUID(),
      f.delivery.id,
      issue.id,
      'Independent reviewed sender return approval',
      'RELEASE_HOLD',
    );
    await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'ARRIVE_RETURN',
    );
    await codes.issue(f.courier, f.delivery.id, 'RETURN');
    const returned = await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'RETURN',
      lastCode(f.delivery.id, 'RETURN').code,
    );
    expect(returned.status).toBe('RETURNED');
    expect(await reserved(f.booker)).toBe(0n);
    expect(
      await db.client.activeJobAssignment.findUnique({
        where: { driverUserId: f.courier.userId },
      }),
    ).toBeNull();
    expect(
      (await db.client.user.findUnique({ where: { id: f.courier.userId } }))
        ?.roles,
    ).not.toContain('DRIVER');
  });
  it('validates photo ownership, signatures, digests, expiry and identical orphan retries', async () => {
    const owner = await actor(),
      stranger = await actor(),
      photos = new DeliveryPhotoService(
        repository,
        new LocalPackagePhotos(deliveryConfig),
        identity,
        transactions,
        access,
        deliveryConfig,
      ),
      bytes = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0,
      ]),
      body = {
        contentType: 'image/png' as const,
        byteLength: bytes.length,
        contentSha256: createHash('sha256').update(bytes).digest('hex'),
      },
      intent = await photos.intent(owner, body);
    await expect(
      photos.upload(stranger, intent.id, bytes),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      photos.upload(owner, intent.id, Buffer.alloc(16)),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const failed = jest
      .spyOn(repository, 'storePhoto')
      .mockRejectedValueOnce(
        new Error('Isolated commit failure after private write'),
      );
    await expect(photos.upload(owner, intent.id, bytes)).rejects.toThrow(
      'Isolated commit failure',
    );
    failed.mockRestore();
    expect((await photos.upload(owner, intent.id, bytes)).status).toBe(
      'STORED',
    );
    expect(
      Buffer.from((await photos.download(owner, intent.id)).bytes),
    ).toEqual(bytes);
    await expect(photos.download(stranger, intent.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const forged = await photos.intent(owner, {
      ...body,
      contentSha256: createHash('sha256')
        .update(Buffer.alloc(16))
        .digest('hex'),
    });
    await expect(
      photos.upload(owner, forged.id, Buffer.alloc(16)),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const expired = await db.client.deliveryPackagePhoto.create({
      data: {
        ownerUserId: owner.userId,
        status: 'PENDING_UPLOAD',
        objectKey: randomUUID(),
        ...body,
        createdAt: new Date(Date.now() - 700000),
        uploadExpiresAt: new Date(Date.now() - 1),
      },
    });
    await expect(photos.upload(owner, expired.id, bytes)).rejects.toMatchObject(
      { code: 'UPLOAD_EXPIRED' },
    );
  });
  it('does not expose a terminal courier photo or precise tracking after closure', async () => {
    const f = await atDestination();
    await codes.issue(f.courier, f.delivery.id, 'HANDOVER');
    await lifecycle.advance(
      f.courier,
      randomUUID(),
      f.delivery.id,
      'DELIVER',
      lastCode(f.delivery.id, 'HANDOVER').code,
    );
    const view = await reads.snapshot(f.courier, f.delivery.id);
    expect(view.sender.phone).toBeNull();
    expect(view.recipient.phone).toBeNull();
    expect(view.package.photoId).toBeNull();
    expect((await reads.tracking(f.booker, f.delivery.id)).position).toBeNull();
    const photos = new DeliveryPhotoService(
      repository,
      new LocalPackagePhotos(deliveryConfig),
      identity,
      transactions,
      access,
      deliveryConfig,
    );
    await expect(
      photos.download(f.courier, f.delivery.packagePhotoId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('expires tracking capability access without returning or reviving its secret', async () => {
    const owner = await actor(),
      d = await book(owner),
      input = {
        id: randomUUID(),
        secret: randomBytes(32).toString('base64url'),
        ttlSeconds: 600,
      },
      cap = await tracking.issue(owner, d.id, input);
    expect(cap).not.toHaveProperty('token');
    expect(cap).not.toHaveProperty('secret');
    const expiredInput = { ...input, id: randomUUID() },
      token = `${expiredInput.id}.${expiredInput.secret}`;
    await db.client.deliveryTrackingCapability.create({
      data: {
        id: expiredInput.id,
        deliveryId: d.id,
        issuedById: owner.userId,
        tokenHash: identity.pseudonym('delivery-tracking', token),
        requestedTtlSeconds: 600,
        createdAt: new Date(Date.now() - 1200000),
        expiresAt: new Date(Date.now() - 600000),
      },
    });
    await expect(tracking.publicView(`Bearer ${token}`)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const replay = await tracking.issue(owner, d.id, expiredInput);
    expect(replay.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('serializes handover completion against support-authorized return without releasing unknown custody', async () => {
    const f = await atDestination(),
      admin = await actor('ADMIN');
    await codes.issue(f.courier, f.delivery.id, 'HANDOVER');
    await reviews.issue(
      f.booker,
      randomUUID(),
      f.delivery.id,
      'DISPUTE',
      'Isolated completion and return race',
    );
    const [issue] = await repository.issues(f.delivery.id);
    if (!issue) throw Error('Missing issue');
    const results = await Promise.allSettled([
      lifecycle.advance(
        f.courier,
        randomUUID(),
        f.delivery.id,
        'DELIVER',
        lastCode(f.delivery.id, 'HANDOVER').code,
      ),
      reviews.resolve(
        admin,
        randomUUID(),
        f.delivery.id,
        issue.id,
        'Independent isolated return race approval',
        'RELEASE_HOLD',
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const current = await repository.get(f.delivery.id);
    if (!current) throw Error('Missing delivery');
    const slot = await db.client.activeJobAssignment.findUnique({
      where: { driverUserId: f.courier.userId },
    });
    if (current.status === 'DELIVERED') {
      expect(slot).toBeNull();
      expect(await reserved(f.booker)).toBe(0n);
      expect(current.chargedAmountXaf).toBe(current.quotedAmountXaf);
    } else {
      expect(current.status).toBe('RETURNING');
      expect(slot?.mobilityJobId).toBe(current.id);
      expect(await reserved(f.booker)).toBe(current.quotedAmountXaf);
      expect(current.chargedAmountXaf).toBe(0n);
    }
  });
  it('excludes a late-registered recipient courier even before contact binding wins the race', async () => {
    const owner = await actor(),
      guestPhone = `+2376${randomInt(10000000, 100000000)}`,
      d = await book(owner, guestPhone),
      courier = await actor('DRIVER', guestPhone);
    await dispatch.execute(d.id);
    expect(
      (await repository.courierOffers(courier.userId)).some(
        (o) => o.deliveryId === d.id,
      ),
    ).toBe(false);
    // An already-delayed offer must also fail authoritative acceptance, even before claim.
    await transactions.run((c) =>
      repository.createOffers(c, d, [courier.userId], 1, 2000),
    );
    const offer = await offered(courier, d.id),
      results = await Promise.allSettled([
        offers.respond(courier, randomUUID(), offer.id, true),
        reviews.claim(courier, randomUUID(), d.id, 'RECIPIENT'),
      ]);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    const current = await repository.get(d.id);
    expect(current?.recipientUserId).toBe(courier.userId);
    expect(current?.courierUserId).toBeNull();
  });
  it('authorizes current participants for minimal M7 live projections and removes revoked/terminal access', async () => {
    const f = await collected(),
      live = new DeliveryLiveService(deliveryConfig, access, transactions),
      stranger = await actor();
    await expect(live.snapshot(stranger, f.delivery.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const view = await live.snapshot(f.booker, f.delivery.id);
    expect(
      await transactions.run((c) =>
        repository.activeContact(c, f.booker.userId),
      ),
    ).toBe(true);
    expect(
      await transactions.run((c) =>
        repository.activeContact(c, stranger.userId),
      ),
    ).toBe(false);
    expect(
      await transactions.run((c) =>
        access.callingContext(c, f.booker, f.delivery.id, f.courier.userId),
      ),
    ).toEqual({ eligible: true });
    expect(
      await transactions.run((c) =>
        access.callingContext(c, f.booker, f.delivery.id, stranger.userId),
      ),
    ).toEqual({ eligible: false });
    expect(
      await transactions.run((c) =>
        access.communicationContext(c, f.booker, f.delivery.id),
      ),
    ).toEqual(expect.objectContaining({ writable: true }));
    await expect(
      transactions.run((c) =>
        access.communicationContext(c, stranger, f.delivery.id),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(view.jobType).toBe('DELIVERY');
    expect(view.position).not.toBeNull();
    expect(view).not.toHaveProperty('recipientPhone');
    expect(view).not.toHaveProperty('reservationId');
    await db.client.authSession.update({
      where: { id: f.booker.sessionId },
      data: { revokedAt: new Date() },
    });
    await expect(live.snapshot(f.booker, f.delivery.id)).rejects.toBeDefined();
    await expect(
      transactions.run((c) =>
        access.communicationContext(c, f.booker, f.delivery.id),
      ),
    ).rejects.toBeDefined();
  });
});
