import { RideLiveService } from '../../src/modules/rides/application/ride-live.service.js';
import { assignedMobilityFixture } from '../helpers/assigned-mobility-fixture.js';
import { callingHarness } from '../helpers/calling-harness.js';
import 'reflect-metadata';
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
import { PrismaRideRepository } from '../../src/modules/rides/infrastructure/prisma-ride.repository.js';
import { RideRequestService } from '../../src/modules/rides/application/ride-request.service.js';
import { RideAccessService } from '../../src/modules/rides/application/ride-access.service.js';
import { RideBookingService } from '../../src/modules/rides/application/ride-booking.service.js';
import { RideDispatchService } from '../../src/modules/rides/application/ride-dispatch.service.js';
import { RideOfferService } from '../../src/modules/rides/application/ride-offer.service.js';
import { RideLifecycleService } from '../../src/modules/rides/application/ride-lifecycle.service.js';
import { RideReadService } from '../../src/modules/rides/application/ride-read.service.js';
import { RideReviewService } from '../../src/modules/rides/application/ride-review.service.js';
import { RidesConfig } from '../../src/modules/rides/rides.config.js';
import { terminal } from '../../src/modules/rides/domain/ride-rules.js';
import type { Actor } from '../../src/shared/contracts/actor.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
// Written source only. PostgreSQL proves races; this admission double does not prove Redis limits.
class AdmissionDouble extends RateLimitPort {
  consume() {
    return Promise.resolve();
  }
}
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error('Explicitly authorized isolated service tests required');
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test')
  throw new Error('Ride integration requires zipp_test');
describe('M5 real database assignment and money invariants', () => {
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
  const repository = new PrismaRideRepository(db, transactions),
    requests = new RideRequestService(repository),
    access = new RideAccessService(repository, identity, jobs, drivers),
    rideConfig = new RidesConfig({ NODE_ENV: 'test', RIDES_ENABLED: 'true' });
  const booking = new RideBookingService(
      repository,
      requests,
      transactions,
      audit,
      identity,
      finance,
      pricing,
      jobs,
      rideConfig,
      new AdmissionDouble(),
    ),
    dispatch = new RideDispatchService(
      repository,
      identity,
      drivers,
      jobs,
      pricing,
      finance,
      transactions,
      audit,
    ),
    offers = new RideOfferService(
      repository,
      requests,
      identity,
      drivers,
      jobs,
      pricing,
      transactions,
      audit,
      rideConfig,
    ),
    lifecycle = new RideLifecycleService(
      repository,
      requests,
      access,
      finance,
      jobs,
      identity,
      transactions,
      audit,
      rideConfig,
    ),
    reads = new RideReadService(
      repository,
      access,
      identity,
      drivers,
      transactions,
    ),
    reviews = new RideReviewService(
      repository,
      access,
      requests,
      finance,
      jobs,
      transactions,
      audit,
      rideConfig,
    );
  const users: Actor[] = [],
    rideIds: string[] = [],
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
      // Cleanup only this suite's retained fixture operations; never delete money/audit history.
      for (const id of rideIds)
        await transactions.run(async (context) => {
          const r = await repository.ride(id, context);
          if (!r || terminal(r.status)) return;
          await identity.lockUsers(context, [
            r.customerUserId,
            ...(r.driverUserId ? [r.driverUserId] : []),
          ]);
          await jobs.lock(context, id);
          await repository.lock(context, id);
          await finance.releaseFunds(context, r.reservationId);
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
              completionPinHash: null,
              pinExpiresAt: null,
            },
            'ride.fixture_cleanup',
          );
        });
      for (const fixture of extraJobs) await fixture.close();
      for (const actor of users) {
        await db.client.authSession.updateMany({
          where: { userId: actor.userId },
          data: { revokedAt: new Date() },
        });
        await db.client.user.update({
          where: { id: actor.userId },
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
  ): Promise<Actor> {
    const u = await db.client.user.create({
      data: {
        phone: `+2376${randomInt(10000000, 100000000)}`,
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
    if (role === 'DRIVER') {
      const app = await db.client.driverApplication.create({
        data: {
          ownerUserId: u.id,
          status: 'APPROVED',
          approvedClasses: ['EVERYDAY'],
          vehicle: {
            create: {
              registrationPlate: `TEST ${randomInt(100000, 999999)}`,
              manufacturer: 'Fixture',
              model: 'Car',
              color: 'Blue',
              manufactureYear: 2020,
              seatCount: 4,
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
      // Prevalidated location/document fixtures isolate SQL lifecycle races, not file/native transport.
      await db.client.driverPresence.create({
        data: {
          driverApplicationId: app.id,
          authSessionId: s.id,
          locationSessionId: randomUUID(),
          online: true,
          sessionExpiresAt: new Date(Date.now() + 3600000),
          sequence: 1,
          latitude: 4.05,
          longitude: 9.7,
          accuracyMeters: 10,
          capturedAt: new Date(),
          receivedAt: new Date(),
        },
      });
    }
    return result;
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
        'Isolated ride fixture',
        [
          { walletAccountId: wallet.id, amountXaf: 20000n },
          { walletAccountId: CLEARING_ACCOUNT_ID, amountXaf: -20000n },
        ],
      );
    });
  }
  async function quote(owner: Actor) {
    return pricingService.create(owner, randomUUID(), {
      serviceAreaId: '00000000-0000-4000-8000-000000000004',
      serviceClass: 'EVERYDAY',
      pickup: { latitude: 4.05, longitude: 9.7 },
      destination: { latitude: 4.06, longitude: 9.72 },
    });
  }
  async function book(owner: Actor) {
    await seed(owner);
    const q = await quote(owner),
      ride = await booking.book(owner, randomUUID(), q.id);
    rideIds.push(ride.id);
    return ride;
  }
  async function offered(driver: Actor, id: string) {
    const offer = (await repository.driverOffers(driver.userId)).find(
      (row) => row.rideId === id,
    );
    if (!offer) throw new Error('Fixture driver was not offered the ride');
    return offer;
  }
  async function move(driver: Actor, destination = false) {
    const app = await driverRepository.findOwner(driver.userId);
    if (!app) throw new Error('Missing fixture driver');
    await db.client.driverPresence.update({
      where: { driverApplicationId: app.id },
      data: {
        latitude: destination ? 4.06 : 4.05,
        longitude: destination ? 9.72 : 9.7,
        capturedAt: new Date(),
        receivedAt: new Date(),
        sequence: { increment: 1 },
      },
    });
  }
  async function assigned() {
    const c = await actor(),
      d = await actor('DRIVER'),
      r = await book(c);
    await dispatch.execute(r.id);
    const offer = await offered(d, r.id);
    await offers.respond(d, randomUUID(), offer.id, true);
    return { customer: c, driver: d, ride: r };
  }
  async function started() {
    const fixture = await assigned();
    await lifecycle.advance(
      fixture.driver,
      randomUUID(),
      fixture.ride.id,
      'arrive',
    );
    await lifecycle.advance(
      fixture.driver,
      randomUUID(),
      fixture.ride.id,
      'start',
    );
    return fixture;
  }
  it('rolls back quote consumption and booking when the wallet cannot fund it', async () => {
    const c = await actor(),
      q = await quote(c);
    await expect(booking.book(c, randomUUID(), q.id)).rejects.toMatchObject({
      code: 'INSUFFICIENT_FUNDS',
    });
    expect((await pricingService.get(c, q.id)).consumedAt).toBeNull();
    expect(await repository.active(c.userId)).toHaveLength(0);
  });
  it('assigns one ride to one winner when two eligible drivers accept concurrently', async () => {
    const c = await actor(),
      a = await actor('DRIVER'),
      b = await actor('DRIVER'),
      r = await book(c);
    await dispatch.execute(r.id);
    const oa = await offered(a, r.id),
      ob = await offered(b, r.id);
    const results = await Promise.allSettled([
      offers.respond(a, randomUUID(), oa.id, true),
      offers.respond(b, randomUUID(), ob.id, true),
    ]);
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.client.activeJobAssignment.count({
        where: { mobilityJobId: r.id },
      }),
    ).toBe(1);
    expect((await financeRepository.balance(c.userId))?.reservedAmountXaf).toBe(
      r.quotedAmountXaf,
    );
  });
  it('keeps one driver from claiming two offered rides and survives stale queued work', async () => {
    const a = await actor(),
      b = await actor(),
      d = await actor('DRIVER'),
      ra = await book(a),
      rb = await book(b);
    await dispatch.execute(ra.id);
    await dispatch.execute(rb.id);
    const oa = await offered(d, ra.id),
      ob = await offered(d, rb.id);
    const outcomes = await Promise.allSettled([
      offers.respond(d, randomUUID(), oa.id, true),
      offers.respond(d, randomUUID(), ob.id, true),
    ]);
    expect(outcomes.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    const winner = await db.client.activeJobAssignment.findUniqueOrThrow({
      where: { driverUserId: d.userId },
    });
    await dispatch.execute(winner.mobilityJobId);
    expect(
      await db.client.activeJobAssignment.findUnique({
        where: { driverUserId: d.userId },
      }),
    ).not.toBeNull();
  });
  it('shares assignment exclusion with a delivery and permits a safe acceptance retry', async () => {
    const c = await actor(),
      d = await actor('DRIVER'),
      r = await book(c);
    await dispatch.execute(r.id);
    const offer = await offered(d, r.id);
    const fixture = await assignedMobilityFixture(
      { db, transactions, identity, jobs, finance, pricing, pricingService },
      c,
      d,
      'DELIVERY',
    );
    extraJobs.push(fixture);
    const key = randomUUID();
    await expect(offers.respond(d, key, offer.id, true)).rejects.toMatchObject({
      code: 'DRIVER_BUSY',
    });
    await fixture.close();
    await offers.respond(d, key, offer.id, true);
    expect((await repository.ride(r.id))?.driverUserId).toBe(d.userId);
  });
  it('releases an expired search hold once and exposes no tracking to unrelated users', async () => {
    const c = await actor(),
      stranger = await actor(),
      r = await book(c);
    await db.client.ride.update({
      where: { id: r.id },
      data: { searchExpiresAt: new Date(Date.now() - 1000) },
    });
    await dispatch.execute(r.id);
    await dispatch.execute(r.id);
    expect((await repository.ride(r.id))?.status).toBe('NO_DRIVER');
    expect((await financeRepository.balance(c.userId))?.reservedAmountXaf).toBe(
      0n,
    );
    await expect(reads.tracking(stranger, r.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('charges only the snapshotted cancellation fee and refunds that capture without overdrawing', async () => {
    const f = await assigned(),
      admin = await actor('ADMIN');
    await lifecycle.cancel(
      f.customer,
      randomUUID(),
      f.ride.id,
      'Cancel isolated accepted ride',
    );
    const cancelled = await repository.ride(f.ride.id);
    expect(cancelled?.chargedAmountXaf).toBe(500n);
    const reservation = await transactions.run((context) =>
      financeRepository.reservation(context, f.ride.reservationId),
    );
    expect(reservation.capturedAmountXaf).toBe(500n);
    expect(
      (await financeRepository.balance(f.customer.userId))?.reservedAmountXaf,
    ).toBe(0n);
    await reviews.dispute(
      f.customer,
      randomUUID(),
      f.ride.id,
      'Dispute isolated cancellation fee',
    );
    await reviews.resolve(
      admin,
      randomUUID(),
      f.ride.id,
      'refund',
      'Refund verified isolated cancellation charge',
    );
    expect(
      (await financeRepository.balance(f.customer.userId))?.postedAmountXaf,
    ).toBe(20000n);
  });
  it('commits failed PIN counters and cannot create a second settlement on retry', async () => {
    const f = await started();
    const issued = await lifecycle.issuePin(f.customer, f.ride.id);
    await move(f.driver, true);
    const bad = issued.pin === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(
        lifecycle.complete(f.driver, randomUUID(), f.ride.id, bad),
      ).rejects.toMatchObject({ code: 'INVALID_COMPLETION_PIN' });
    await expect(
      lifecycle.complete(f.driver, randomUUID(), f.ride.id, issued.pin),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect((await repository.ride(f.ride.id))?.pinFailureCount).toBe(5);
  });
  it('serializes completion against manual dispute release and keeps money/assignment consistent', async () => {
    const f = await started(),
      admin = await actor('ADMIN');
    const code = await lifecycle.issuePin(f.customer, f.ride.id);
    await move(f.driver, true);
    await reviews.dispute(
      f.customer,
      randomUUID(),
      f.ride.id,
      'Review isolated in-progress ride',
    );
    const key = randomUUID();
    const outcomes = await Promise.allSettled([
      lifecycle.complete(f.driver, key, f.ride.id, code.pin),
      reviews.resolve(
        admin,
        randomUUID(),
        f.ride.id,
        'release',
        'Verified isolated ride release decision',
      ),
    ]);
    expect(outcomes.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    const current = await repository.ride(f.ride.id);
    expect(current && terminal(current.status)).toBe(true);
    expect(
      await db.client.activeJobAssignment.findUnique({
        where: { mobilityJobId: f.ride.id },
      }),
    ).toBeNull();
    expect(
      (await financeRepository.balance(f.customer.userId))?.reservedAmountXaf,
    ).toBe(0n);
    if (current?.status === 'COMPLETED') {
      await lifecycle.complete(f.driver, key, f.ride.id, code.pin);
      expect(
        await db.client.ledgerTransaction.count({
          where: { businessKey: `capture:${f.ride.reservationId}` },
        }),
      ).toBe(1);
    } else expect(current?.chargedAmountXaf).toBe(0n);
  });
  it('authorizes current participants for minimal M7 live projections and removes revoked/terminal access', async () => {
    const f = await assigned(),
      live = new RideLiveService(
        rideConfig,
        access,
        repository,
        drivers,
        transactions,
        jobs,
      ),
      stranger = await actor();
    await expect(live.snapshot(stranger, f.ride.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const active = await live.snapshot(f.customer, f.ride.id);
    expect(
      await transactions.run((c) =>
        access.communicationContext(c, f.customer, f.ride.id),
      ),
    ).toEqual(expect.objectContaining({ writable: true }));
    await expect(
      transactions.run((c) =>
        access.communicationContext(c, stranger, f.ride.id),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(active.jobType).toBe('RIDE');
    expect(active).not.toHaveProperty('quotedAmountXaf');
    await lifecycle.cancel(
      f.customer,
      randomUUID(),
      f.ride.id,
      'Isolated live projection cancellation',
    );
    const closed = await live.snapshot(f.customer, f.ride.id);
    expect(closed.terminal).toBe(true);
    expect(closed.position).toBeNull();
    expect(
      await transactions.run((c) =>
        access.communicationContext(c, f.customer, f.ride.id),
      ),
    ).toEqual(expect.objectContaining({ writable: false }));
  });
  async function callDevice(
    h: Awaited<ReturnType<typeof callingHarness>>,
    a: Actor,
  ) {
    const id = randomUUID(),
      proof = randomBytes(32).toString('base64url');
    await h.devices.register(a, id, {
      proof,
      pushToken: 'local_' + randomBytes(24).toString('base64url'),
      platform: 'IOS',
      provider: 'LOCAL',
      expectedGeneration: 0,
    });
    return { deviceId: id, deviceGeneration: 1, proof };
  }
  it('M7.4 deduplicates creation and lets exactly one callee device answer without releasing the ride', async () => {
    const f = await assigned(),
      h = await callingHarness(
        db,
        transactions,
        identity,
        audit,
        access.callingContext.bind(access),
      ),
      callerDevice = await callDevice(h, f.customer),
      first = await callDevice(h, f.driver),
      second = await callDevice(h, f.driver),
      key = randomUUID(),
      input = {
        ...callerDevice,
        jobType: 'RIDE' as const,
        jobId: f.ride.id,
        peerUserId: f.driver.userId,
      };
    const created = await Promise.all([
      h.creates.create(f.customer, key, input),
      h.creates.create(f.customer, key, input),
    ]);
    expect(created[0]).toEqual(created[1]);
    const call = created[0];
    if (!call) throw new Error('Missing call');
    const answers = await Promise.allSettled([
      h.life.command(f.driver, randomUUID(), call.callId, 'ACCEPT', {
        ...first,
        expectedVersion: 1,
      }),
      h.life.command(f.driver, randomUUID(), call.callId, 'ACCEPT', {
        ...second,
        expectedVersion: 1,
      }),
    ]);
    expect(answers.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.client.activeCallParticipant.count({
        where: { callId: call.callId },
      }),
    ).toBe(2);
    expect(
      (await h.reads.snapshot(f.customer, call.callId)).audioAvailable,
    ).toBe(false);
    await h.life.command(f.customer, randomUUID(), call.callId, 'END', {
      ...callerDevice,
      expectedVersion: 2,
    });
    expect(
      await db.client.activeCallParticipant.count({
        where: { callId: call.callId },
      }),
    ).toBe(0);
    expect(
      await db.client.activeJobAssignment.findUnique({
        where: { mobilityJobId: f.ride.id },
      }),
    ).not.toBeNull();
  });
  it('M7.4 competing opposite-direction invitations reserve each account once', async () => {
    const f = await assigned(),
      h = await callingHarness(
        db,
        transactions,
        identity,
        audit,
        access.callingContext.bind(access),
      ),
      customerDevice = await callDevice(h, f.customer),
      driverDevice = await callDevice(h, f.driver);
    const results = await Promise.allSettled([
      h.creates.create(f.customer, randomUUID(), {
        ...customerDevice,
        jobType: 'RIDE',
        jobId: f.ride.id,
        peerUserId: f.driver.userId,
      }),
      h.creates.create(f.driver, randomUUID(), {
        ...driverDevice,
        jobType: 'RIDE',
        jobId: f.ride.id,
        peerUserId: f.customer.userId,
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const success = results.find((r) => r.status === 'fulfilled');
    if (success?.status !== 'fulfilled') throw new Error('Missing call');
    const row = await db.client.callSession.findUniqueOrThrow({
        where: { id: success.value.callId },
      }),
      customer = row.callerUserId === f.customer.userId;
    await h.life.command(
      customer ? f.customer : f.driver,
      randomUUID(),
      row.id,
      'END',
      { ...(customer ? customerDevice : driverDevice), expectedVersion: 1 },
    );
  });
  it('M7.4 commits expiration before an answer conflict and never resurrects through replay', async () => {
    const f = await assigned(),
      h = await callingHarness(
        db,
        transactions,
        identity,
        audit,
        access.callingContext.bind(access),
      ),
      callerDevice = await callDevice(h, f.customer),
      calleeDevice = await callDevice(h, f.driver),
      createKey = randomUUID(),
      input = {
        ...callerDevice,
        jobType: 'RIDE' as const,
        jobId: f.ride.id,
        peerUserId: f.driver.userId,
      },
      created = await h.creates.create(f.customer, createKey, input),
      row = await db.client.callSession.findUniqueOrThrow({
        where: { id: created.callId },
      });
    const clock = jest
      .spyOn(h.repo, 'now')
      .mockResolvedValue(new Date(row.ringExpiresAt.getTime() + 1));
    try {
      await expect(
        h.life.command(f.driver, randomUUID(), created.callId, 'ACCEPT', {
          ...calleeDevice,
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'CALL_EXPIRED' });
    } finally {
      clock.mockRestore();
    }
    expect(
      (
        await db.client.callSession.findUniqueOrThrow({
          where: { id: created.callId },
        })
      ).status,
    ).toBe('MISSED');
    expect(await h.creates.create(f.customer, createKey, input)).toEqual(
      created,
    );
    expect(
      await db.client.activeCallParticipant.count({
        where: { callId: created.callId },
      }),
    ).toBe(0);
  });
  it('M7.4 cleanup observes revoked device/session and only closes call metadata', async () => {
    const f = await assigned(),
      h = await callingHarness(
        db,
        transactions,
        identity,
        audit,
        access.callingContext.bind(access),
      ),
      callerDevice = await callDevice(h, f.customer),
      created = await h.creates.create(f.customer, randomUUID(), {
        ...callerDevice,
        jobType: 'RIDE',
        jobId: f.ride.id,
        peerUserId: f.driver.userId,
      });
    await h.devices.revoke(f.customer, callerDevice.deviceId, {
      proof: callerDevice.proof,
      expectedGeneration: 1,
    });
    await h.reaper.reap();
    expect(
      (
        await db.client.callSession.findUniqueOrThrow({
          where: { id: created.callId },
        })
      ).status,
    ).toBe('FAILED');
    expect(
      await db.client.activeJobAssignment.findUnique({
        where: { mobilityJobId: f.ride.id },
      }),
    ).not.toBeNull();
  });
});
