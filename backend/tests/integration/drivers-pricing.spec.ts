import 'reflect-metadata';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from '@jest/globals';
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
import { PrismaDriverRepository } from '../../src/modules/drivers/infrastructure/prisma-driver.repository.js';
import { DriverService } from '../../src/modules/drivers/application/driver.service.js';
import { JobsFacade } from '../../src/modules/jobs/jobs.facade.js';
import { PrismaJobsRepository } from '../../src/modules/jobs/infrastructure/prisma-jobs.repository.js';
import { DriverDocumentService } from '../../src/modules/drivers/application/driver-document.service.js';
import { DocumentStorage } from '../../src/modules/drivers/application/document-storage.port.js';
import { DriversConfig } from '../../src/modules/drivers/drivers.config.js';
import { PrismaPricingRepository } from '../../src/modules/pricing/infrastructure/prisma-pricing.repository.js';
import { PricingService } from '../../src/modules/pricing/application/pricing.service.js';
import { FixtureRoutingProvider } from '../../src/modules/pricing/infrastructure/fixture-routing.provider.js';
import { PricingConfig } from '../../src/modules/pricing/pricing.config.js';
import type { Actor } from '../../src/shared/contracts/actor.js';
import type { QuoteInput } from '../../src/modules/pricing/contracts/pricing.schemas.js';

// Written only. No development database or runtime scenarios may be used to execute this suite.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error(
    'Use the isolated service-test project on explicit authorization',
  );
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test')
  throw new Error('M4 integration requires zipp_test');
class MemoryDocuments extends DocumentStorage {
  private readonly values = new Map<string, Uint8Array>();
  write(key: string, content: Uint8Array) {
    const previous = this.values.get(key);
    if (previous && !Buffer.from(previous).equals(Buffer.from(content)))
      throw new Error('Content is immutable');
    this.values.set(key, Uint8Array.from(content));
    return Promise.resolve();
  }
  read(key: string) {
    const value = this.values.get(key);
    if (!value) throw new Error('Missing document');
    return Promise.resolve(value);
  }
}
describe('M4 authoritative driver and quote state', () => {
  const db = new DatabaseService(config),
    transactions = new DatabaseUnitOfWork(db),
    audit = new DatabaseAudit(transactions);
  const identities = new PrismaIdentityRepository(db, transactions),
    crypto = new NodeIdentityCrypto(identityTestConfig());
  const identity = new IdentityFacade(
    new SessionService(identities, crypto, transactions, audit),
    crypto,
    identities,
  );
  const repository = new PrismaDriverRepository(db, transactions),
    drivers = new DriverService(
      repository,
      identity,
      transactions,
      audit,
      new JobsFacade(new PrismaJobsRepository(transactions, db)),
    );
  const documents = new DriverDocumentService(
    repository,
    new MemoryDocuments(),
    new DriversConfig({
      NODE_ENV: 'test',
      DRIVER_UPLOADS_ENABLED: 'true',
      DRIVER_DOCUMENT_STORAGE: 'local',
      DRIVER_DOCUMENT_ROOT: '/isolated-memory-adapter-only',
    }),
    identity,
    transactions,
    audit,
  );
  const pricingRepository = new PrismaPricingRepository(db, transactions),
    pricingConfig = new PricingConfig({
      NODE_ENV: 'test',
      PRICING_ENABLED: 'true',
      ROUTING_ADAPTER: 'fixture',
    });
  const pricing = new PricingService(
    pricingRepository,
    new FixtureRoutingProvider(pricingConfig),
    pricingConfig,
    identity,
    transactions,
    audit,
  );
  const fixtureUsers: string[] = [];
  beforeAll(() => db.onModuleInit());
  afterAll(async () => {
    try {
      for (const id of fixtureUsers) {
        await db.client.authSession.updateMany({
          where: { userId: id },
          data: { revokedAt: new Date() },
        });
        await db.client.user.update({
          where: { id },
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
  async function actor(admin = false): Promise<Actor> {
    const user = await db.client.user.create({
      data: {
        phone: `+2376${randomInt(10_000_000, 100_000_000)}`,
        passwordHash: 'isolated-no-password-login',
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        roles: admin ? ['ADMIN'] : ['CUSTOMER'],
        twoFactorSecret: admin ? 'isolated-enrollment-presence' : null,
      },
    });
    fixtureUsers.push(user.id);
    const session = await db.client.authSession.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600_000),
        mfaVerifiedAt: admin ? new Date() : null,
      },
    });
    return {
      userId: user.id,
      sessionId: session.id,
      roles: user.roles,
      mfaEnabled: admin,
      mfaVerifiedAt: session.mfaVerifiedAt,
    };
  }
  async function application(owner: Actor) {
    const row = await drivers.vehicle(owner, {
      registrationPlate: `DEV ${randomInt(100000, 999999)}`,
      manufacturer: 'Fixture',
      model: 'Car',
      color: 'Blue',
      manufactureYear: 2020,
      seatCount: 4,
    });
    if (!row) throw new Error('Missing application');
    const bytes = Buffer.from('%PDF-1.7\nFixture document only\n');
    for (const kind of [
      'IDENTITY',
      'LICENSE',
      'VEHICLE_REGISTRATION',
      'INSURANCE',
    ] as const) {
      const intent = await documents.intent(owner, {
        kind,
        contentType: 'application/pdf',
        byteLength: bytes.length,
        contentSha256: createHash('sha256').update(bytes).digest('hex'),
        documentExpiresAt: new Date(Date.now() + 60 * 86400_000).toISOString(),
      });
      await documents.upload(owner, intent.id, bytes);
    }
    await drivers.submit(owner);
    return row;
  }
  it('requires independent review, complete documents and the current revision', async () => {
    const owner = await actor(true),
      admin = await actor(true);
    const row = await application(owner);
    const decision = {
      expectedRevision: 1,
      decision: 'approve' as const,
      reason: 'Reviewed isolated application documents',
      approvedClasses: ['EVERYDAY' as const],
      documentsReviewed: true,
    };
    await expect(drivers.review(owner, row.id, decision)).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );
    await expect(
      drivers.review(admin, row.id, { ...decision, expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await drivers.review(admin, row.id, decision);
    expect((await identities.user(owner.userId))?.roles).toContain('DRIVER');
    await drivers.review(admin, row.id, {
      ...decision,
      decision: 'suspend',
      approvedClasses: [],
      reason: 'Suspended isolated review scenario',
    });
    expect((await identities.user(owner.userId))?.roles).not.toContain(
      'DRIVER',
    );
    await expect(drivers.availability(owner, true)).rejects.toMatchObject({
      code: 'DRIVER_NOT_ELIGIBLE',
    });
  });
  it('protects private files and freezes submitted application content', async () => {
    const owner = await actor(),
      other = await actor();
    const row = await application(owner);
    const docs = await repository.documents(row.id, 1);
    const first = docs[0];
    if (!first) throw new Error('Missing document');
    await expect(documents.download(other, first.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(documents.uploadTarget(owner, first.id)).rejects.toMatchObject(
      { code: 'INVALID_TRANSITION' },
    );
    expect((await documents.download(owner, first.id)).bytes.byteLength).toBe(
      first.byteLength,
    );
  });
  it('rejects stale location epochs after suspension and sequence replay', async () => {
    const owner = await actor(),
      admin = await actor(true);
    const row = await application(owner);
    await drivers.review(admin, row.id, {
      expectedRevision: 1,
      decision: 'approve',
      reason: 'Reviewed isolated application documents',
      approvedClasses: ['EVERYDAY'],
      documentsReviewed: true,
    });
    const epoch = await drivers.availability(owner, true);
    const location = {
      schemaVersion: 1 as const,
      locationSessionId: epoch.locationSessionId,
      sequence: 1,
      latitude: 4.05,
      longitude: 9.7,
      accuracyMeters: 10,
      capturedAt: new Date().toISOString(),
    };
    await drivers.location(owner, location);
    await expect(drivers.location(owner, location)).rejects.toMatchObject({
      code: 'LOCATION_SEQUENCE_CONFLICT',
    });
    await drivers.review(admin, row.id, {
      expectedRevision: 1,
      decision: 'suspend',
      reason: 'Suspend after initial accepted position',
      approvedClasses: [],
      documentsReviewed: false,
    });
    await expect(
      drivers.location(owner, { ...location, sequence: 2 }),
    ).rejects.toThrow();
    expect((await repository.find(row.id))?.presence?.online).toBe(false);
  });
  async function quoteInput(admin: Actor): Promise<QuoteInput> {
    const area = await pricing.createArea(admin, {
      code: `TEST_${randomInt(100000, 999999)}`,
      name: 'Isolated development fixture',
      minimumLatitude: 3.9,
      maximumLatitude: 4.2,
      minimumLongitude: 9.6,
      maximumLongitude: 9.9,
    });
    await pricing.publish(admin, {
      serviceAreaId: area.id,
      version: 'isolated-v1',
      serviceClass: 'EVERYDAY',
      baseFareXaf: '500',
      perKilometerXaf: '200',
      perMinuteXaf: '30',
      minimumFareXaf: '1000',
      nightMultiplierBps: 12500,
      commissionBps: 1000,
      cancellationFeeXaf: '500',
    });
    return {
      serviceAreaId: area.id,
      serviceClass: 'EVERYDAY',
      pickup: { latitude: 4.05, longitude: 9.7 },
      destination: { latitude: 4.06, longitude: 9.72 },
    };
  }
  it('owns and consumes a server quote once, including simultaneous retries', async () => {
    const owner = await actor(),
      other = await actor(),
      admin = await actor(true);
    const input = await quoteInput(admin),
      key = randomUUID();
    const [first, retry] = await Promise.all([
      pricing.create(owner, key, input),
      pricing.create(owner, key, input),
    ]);
    expect(retry.id).toBe(first.id);
    await expect(pricing.get(other, first.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      pricing.create(owner, key, { ...input, serviceClass: 'COMFORT' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await transactions.run((context) =>
      pricing.consume(context, owner, first.id, 'booking-fixture-1'),
    );
    await transactions.run((context) =>
      pricing.consume(context, owner, first.id, 'booking-fixture-1'),
    );
    await expect(
      transactions.run((context) =>
        pricing.consume(context, owner, first.id, 'booking-fixture-2'),
      ),
    ).rejects.toMatchObject({ code: 'QUOTE_ALREADY_CONSUMED' });
  });
  it('rejects unsupported routes and policy changes without silently repricing', async () => {
    const owner = await actor(),
      admin = await actor(true);
    const input = await quoteInput(admin);
    await expect(
      pricing.create(owner, randomUUID(), {
        ...input,
        destination: { latitude: 0, longitude: 0 },
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_AREA_UNAVAILABLE' });
    const quote = await pricing.create(owner, randomUUID(), input);
    await pricing.publish(admin, {
      serviceAreaId: input.serviceAreaId,
      version: 'isolated-v2',
      serviceClass: 'EVERYDAY',
      baseFareXaf: '600',
      perKilometerXaf: '200',
      perMinuteXaf: '30',
      minimumFareXaf: '1000',
      nightMultiplierBps: 12500,
      commissionBps: 1000,
      cancellationFeeXaf: '500',
    });
    await expect(
      transactions.run((context) =>
        pricing.consume(context, owner, quote.id, 'booking-old-policy'),
      ),
    ).rejects.toMatchObject({ code: 'PRICING_POLICY_CHANGED' });
    expect((await pricing.get(owner, quote.id)).totalAmountXaf).toBe(
      quote.totalAmountXaf,
    );
    await expect(
      db.client.priceQuote.update({
        where: { id: quote.id },
        data: { totalAmountXaf: 1n },
      }),
    ).rejects.toThrow();
  });
});
