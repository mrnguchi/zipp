import 'reflect-metadata';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import { parseEnvironment } from '../../src/config/environment.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  DatabaseUnitOfWork,
  DatabaseAudit,
} from '../../src/platform/database/database-unit-of-work.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../src/shared/contracts/unit-of-work.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import type { Actor, Role } from '../../src/shared/contracts/actor.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { IdentityConfig } from '../../src/modules/identity/identity.config.js';
import { PrismaIdentityRepository } from '../../src/modules/identity/infrastructure/prisma-identity.repository.js';
import { NodeIdentityCrypto } from '../../src/modules/identity/infrastructure/identity-crypto.js';
import { SessionService } from '../../src/modules/identity/application/session.service.js';
import { AccountsFacade } from '../../src/modules/accounts/accounts.facade.js';
import { PrismaAccountsRepository } from '../../src/modules/accounts/infrastructure/prisma-accounts.repository.js';
import { RidesFacade } from '../../src/modules/rides/rides.facade.js';
import { DeliveriesFacade } from '../../src/modules/deliveries/deliveries.facade.js';
import { CommunicationsRepository } from '../../src/modules/communications/application/communications.repository.js';
import { PrismaCommunicationsRepository } from '../../src/modules/communications/infrastructure/prisma-communications.repository.js';
import { CommunicationAccessService } from '../../src/modules/communications/application/communication-access.service.js';
import { CommunicationAdmissionService } from '../../src/modules/communications/application/communication-admission.service.js';
import { CommunicationCommandService } from '../../src/modules/communications/application/communication-command.service.js';
import { CommunicationsConfig } from '../../src/modules/communications/communications.config.js';
import { NotificationsRepository } from '../../src/modules/notifications/application/notifications.repository.js';
import { PrismaNotificationsRepository } from '../../src/modules/notifications/infrastructure/prisma-notifications.repository.js';
import { NotificationCrypto } from '../../src/modules/notifications/application/notification-crypto.port.js';
import { NodeNotificationCrypto } from '../../src/modules/notifications/infrastructure/notification-crypto.js';
import { NotificationProvider } from '../../src/modules/notifications/application/notification-provider.port.js';
import type {
  NotificationDispatch,
  NotificationProviderResult,
} from '../../src/modules/notifications/application/notification-provider.port.js';
import { NotificationAdmissionService } from '../../src/modules/notifications/application/notification-admission.service.js';
import { NotificationDevicesService } from '../../src/modules/notifications/application/notification-devices.service.js';
import { NotificationInboxService } from '../../src/modules/notifications/application/notification-inbox.service.js';
import { NotificationDeliveryService } from '../../src/modules/notifications/application/notification-delivery.service.js';
import { NotificationsFacade } from '../../src/modules/notifications/notifications.facade.js';
import { NotificationsConfig } from '../../src/modules/notifications/notifications.config.js';
import { identityTestConfig } from '../helpers/identity-config.js';
// Written only. Actual PostgreSQL/identity/source transactions; provider and Redis
// admission are doubled. This suite does not prove native push or BullMQ/Redis recovery.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error('Explicit isolated notification test authorization required');
const appConfig = parseEnvironment(process.env);
if (new URL(appConfig.databaseUrl).pathname !== '/zipp_test')
  throw new Error('Notification integration requires zipp_test');
class ControlledProvider extends NotificationProvider {
  readonly calls: NotificationDispatch[] = [];
  result: NotificationProviderResult = 'CAPTURED';
  send(work: NotificationDispatch) {
    this.calls.push(work);
    return Promise.resolve(this.result);
  }
}
describe('M7.3 source atomicity, ownership and durable delivery races', () => {
  const db = new DatabaseService(appConfig),
    tx = new DatabaseUnitOfWork(db),
    audit = new DatabaseAudit(tx),
    identityRepo = new PrismaIdentityRepository(db, tx),
    identityCrypto = new NodeIdentityCrypto(identityTestConfig()),
    sessions = new SessionService(identityRepo, identityCrypto, tx, audit),
    identity = new IdentityFacade(sessions, identityCrypto, identityRepo),
    accounts = new AccountsFacade(
      new PrismaAccountsRepository(db, tx),
      tx,
      audit,
    ),
    repo = new PrismaNotificationsRepository(db, tx),
    communicationRepo = new PrismaCommunicationsRepository(db, tx),
    provider = new ControlledProvider(),
    config = new NotificationsConfig({
      NODE_ENV: 'test',
      SERVICE_ROLE: 'worker',
      NOTIFICATIONS_ENABLED: 'true',
      NOTIFICATION_DISPATCH_ENABLED: 'true',
      NOTIFICATION_DATA_KEY: '44'.repeat(32),
      NOTIFICATION_CAPTURE_ROOT: process.cwd(),
    }),
    crypto = new NodeNotificationCrypto(config);
  let devices: NotificationDevicesService,
    inbox: NotificationInboxService,
    worker: NotificationDeliveryService,
    commands: CommunicationCommandService;
  const actors: Actor[] = [];
  beforeAll(async () => {
    await db.onModuleInit();
    const roles = await db.client.$queryRaw<
      { current_user: string }[]
    >`SELECT current_user`;
    if (roles[0]?.current_user !== 'zipp_app')
      throw new Error('Notification integration requires restricted zipp_app');
    await repo.assertSchema();
    const noJob = {
      communicationContext: () =>
        Promise.reject(new Error('Mobility fixture required')),
    };
    const module = await Test.createTestingModule({
      providers: [
        NotificationAdmissionService,
        NotificationDevicesService,
        NotificationInboxService,
        NotificationDeliveryService,
        NotificationsFacade,
        CommunicationAccessService,
        CommunicationAdmissionService,
        CommunicationCommandService,
        { provide: UnitOfWork, useValue: tx },
        { provide: AuditPort, useValue: audit },
        { provide: IdentityFacade, useValue: identity },
        { provide: AccountsFacade, useValue: accounts },
        { provide: NotificationsRepository, useValue: repo },
        { provide: NotificationCrypto, useValue: crypto },
        { provide: NotificationProvider, useValue: provider },
        { provide: NotificationsConfig, useValue: config },
        { provide: CommunicationsRepository, useValue: communicationRepo },
        {
          provide: CommunicationsConfig,
          useValue: new CommunicationsConfig({
            NODE_ENV: 'test',
            AUTH_ENABLED: 'true',
            COMMUNICATIONS_ENABLED: 'true',
          }),
        },
        {
          provide: RateLimitPort,
          useValue: { consume: () => Promise.resolve() },
        },
        { provide: RidesFacade, useValue: noJob },
        { provide: DeliveriesFacade, useValue: noJob },
      ],
    }).compile();
    devices = module.get(NotificationDevicesService);
    inbox = module.get(NotificationInboxService);
    worker = module.get(NotificationDeliveryService);
    commands = module.get(CommunicationCommandService);
  });
  beforeEach(() => {
    provider.calls.length = 0;
    provider.result = 'CAPTURED';
  });
  afterAll(async () => {
    try {
      for (const a of actors)
        await tx.run(async (c) => {
          await identityRepo.lock(c, a.userId);
          await identityRepo.revoke(c, a.userId, new Date());
        });
    } finally {
      await db.onModuleDestroy();
    }
  });
  async function actor(roles: Role[] = ['CUSTOMER']) {
    const staff = roles.includes('SUPPORT'),
      user = await db.client.user.create({
        data: {
          phone: `+2376${randomInt(10000000, 100000000)}`,
          status: 'ACTIVE',
          phoneVerifiedAt: new Date(),
          roles,
          twoFactorSecret: staff ? 'isolated-mfa-presence-only' : null,
        },
      });
    const grant = await tx.run(async (c) => {
      await identityRepo.lock(c, user.id);
      await accounts.provision(c, user.id, 'Isolated notification account');
      return sessions.grant(c, user, staff ? new Date() : null);
    });
    const a: Actor = {
      userId: user.id,
      sessionId: grant.session.id,
      roles,
      mfaEnabled: staff,
      mfaVerifiedAt: grant.session.mfaVerifiedAt,
    };
    actors.push(a);
    return a;
  }
  async function register(a: Actor) {
    const id = randomUUID(),
      proof = randomBytes(32).toString('base64url'),
      pushToken = 'local_' + randomBytes(24).toString('base64url');
    await devices.register(a, id, {
      proof,
      pushToken,
      expectedGeneration: 0,
      platform: 'IOS',
      provider: 'LOCAL',
    });
    return { id, proof, pushToken };
  }
  async function activity(owner: Actor) {
    const staff = await actor(['SUPPORT']),
      ticket = await commands.createTicket(owner, randomUUID(), {
        subject: 'Isolated notification ticket',
        category: 'ACCOUNT',
        body: 'Private body',
      });
    const sent = await commands.send(
      staff,
      randomUUID(),
      ticket.threadId,
      'Private staff reply',
    );
    const event = await db.client.communicationEvent.findUniqueOrThrow({
      where: {
        threadId_aggregateVersion: {
          threadId: ticket.threadId,
          aggregateVersion: sent.version,
        },
      },
    });
    const intent = await db.client.notificationOutbox.findUniqueOrThrow({
      where: {
        sourceEventId_recipientUserId: {
          sourceEventId: event.id,
          recipientUserId: owner.userId,
        },
      },
    });
    return { staff, ticket, intent };
  }
  it('enforces immutable installation owner/proof and global token uniqueness', async () => {
    const owner = await actor(),
      other = await actor(),
      d = await register(owner);
    const body = {
      proof: d.proof,
      pushToken: d.pushToken,
      expectedGeneration: 0,
      platform: 'IOS' as const,
      provider: 'LOCAL' as const,
    };
    expect((await devices.register(owner, d.id, body)).generation).toBe(1);
    await expect(devices.register(other, d.id, body)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      devices.register(owner, d.id, {
        ...body,
        proof: randomBytes(32).toString('base64url'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      devices.register(other, randomUUID(), body),
    ).rejects.toMatchObject({ code: 'DEVICE_BINDING_CONFLICT' });
    const row = await db.client.notificationDevice.findUniqueOrThrow({
      where: { id: d.id },
    });
    expect(row.tokenCiphertext).not.toContain(d.pushToken);
    expect(row.proofHash).not.toBe(d.proof);
  });
  it('serializes competing token rotations and live-device admission', async () => {
    const owner = await actor(),
      d = await register(owner);
    const changes = await Promise.allSettled(
      ['first', 'second'].map((prefix) =>
        devices.register(owner, d.id, {
          proof: d.proof,
          pushToken: 'local_' + prefix + 'a'.repeat(32),
          expectedGeneration: 1,
          platform: 'IOS',
          provider: 'LOCAL',
        }),
      ),
    );
    expect(changes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (let i = 0; i < 3; i++) await register(owner);
    const results = await Promise.allSettled([
      register(owner),
      register(owner),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('creates one notification intent for a replayed support reply in the same source transaction', async () => {
    const owner = await actor(),
      staff = await actor(['SUPPORT']),
      ticket = await commands.createTicket(owner, randomUUID(), {
        subject: 'Isolated help',
        category: 'ACCOUNT',
        body: 'Private body',
      }),
      key = randomUUID();
    const sent = await Promise.all([
      commands.send(staff, key, ticket.threadId, 'same'),
      commands.send(staff, key, ticket.threadId, 'same'),
    ]);
    expect(sent[0]).toEqual(sent[1]);
    const events = await db.client.communicationEvent.findMany({
      where: { threadId: ticket.threadId, eventType: 'message.sent' },
    });
    expect(events).toHaveLength(1);
    expect(
      await db.client.notificationOutbox.count({
        where: { sourceEventId: events[0]?.id },
      }),
    ).toBe(1);
  });
  it('rolls source message/event/receipt back when atomic notification intent persistence fails', async () => {
    const owner = await actor(),
      staff = await actor(['SUPPORT']),
      ticket = await commands.createTicket(owner, randomUUID(), {
        subject: 'Isolated rollback',
        category: 'ACCOUNT',
        body: 'Original',
      }),
      key = randomUUID();
    const failing = jest
      .spyOn(repo, 'enqueue')
      .mockRejectedValueOnce(new Error('Isolated persistence failure'));
    try {
      await expect(
        commands.send(staff, key, ticket.threadId, 'must rollback'),
      ).rejects.toThrow();
    } finally {
      failing.mockRestore();
    }
    expect(
      await db.client.communicationMessage.count({
        where: { threadId: ticket.threadId },
      }),
    ).toBe(1);
    expect(
      await db.client.communicationCommand.findUnique({
        where: {
          actorUserId_operation_key: {
            actorUserId: staff.userId,
            operation: 'message.send',
            key,
          },
        },
      }),
    ).toBeNull();
    await commands.send(staff, key, ticket.threadId, 'must rollback');
    expect(
      await db.client.communicationMessage.count({
        where: { threadId: ticket.threadId },
      }),
    ).toBe(2);
  });
  it('materializes a single inbox/delivery and does not send twice under competing workers', async () => {
    const owner = await actor();
    await register(owner);
    const f = await activity(owner);
    await Promise.all([
      worker.materialize(f.intent.id),
      worker.materialize(f.intent.id),
    ]);
    expect(
      await db.client.notificationInbox.count({ where: { id: f.intent.id } }),
    ).toBe(1);
    const rows = await db.client.notificationDelivery.findMany({
      where: { notificationId: f.intent.id },
    });
    expect(rows).toHaveLength(1);
    const d = rows[0];
    if (!d) throw new Error('Missing delivery');
    await Promise.all([worker.dispatch(d.id), worker.dispatch(d.id)]);
    expect(provider.calls).toHaveLength(1);
    expect(
      (
        await db.client.notificationDelivery.findUniqueOrThrow({
          where: { id: d.id },
        })
      ).status,
    ).toBe('CAPTURED');
    const list = await inbox.list(owner, { limit: 20 });
    expect(list.items.find((i) => i.id === f.intent.id)).toBeDefined();
    expect(JSON.stringify(list)).not.toContain('Private');
    expect(JSON.stringify(list)).not.toContain(f.ticket.threadId);
  });
  it('suppresses old generations and revoked sessions without erasing the inbox', async () => {
    const owner = await actor(),
      d = await register(owner),
      f = await activity(owner);
    await worker.materialize(f.intent.id);
    await devices.register(owner, d.id, {
      proof: d.proof,
      pushToken: 'local_' + randomBytes(24).toString('base64url'),
      expectedGeneration: 1,
      platform: 'IOS',
      provider: 'LOCAL',
    });
    const row = await db.client.notificationDelivery.findFirstOrThrow({
      where: { notificationId: f.intent.id },
    });
    await worker.dispatch(row.id);
    expect(provider.calls).toHaveLength(0);
    const second = await activity(owner);
    await worker.materialize(second.intent.id);
    await tx.run(async (c) => {
      await identityRepo.lock(c, owner.userId);
      await identityRepo.revoke(c, owner.userId, new Date());
    });
    const next = await db.client.notificationDelivery.findFirstOrThrow({
      where: { notificationId: second.intent.id },
    });
    await worker.dispatch(next.id);
    expect(provider.calls).toHaveLength(0);
    expect(
      (
        await db.client.notificationDelivery.findUniqueOrThrow({
          where: { id: next.id },
        })
      ).status,
    ).toBe('SUPPRESSED');
  });
  it('keeps opt-out inbox history and monotonic owned read acknowledgement', async () => {
    const owner = await actor(),
      other = await actor();
    await register(owner);
    await accounts.update(owner.userId, { notificationsEnabled: false });
    const f = await activity(owner);
    await worker.materialize(f.intent.id);
    expect(
      await db.client.notificationDelivery.count({
        where: { notificationId: f.intent.id },
      }),
    ).toBe(0);
    const read = await inbox.read(owner, f.intent.id);
    expect(read.readAt).not.toBeNull();
    expect(await inbox.read(owner, f.intent.id)).toEqual(read);
    await expect(inbox.read(other, f.intent.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('stops after eight persisted retries and recovers an abandoned final attempt without a ninth send', async () => {
    const owner = await actor();
    await register(owner);
    const f = await activity(owner);
    await worker.materialize(f.intent.id);
    const d = await db.client.notificationDelivery.findFirstOrThrow({
      where: { notificationId: f.intent.id },
    });
    provider.result = 'RETRY';
    for (let i = 0; i < 8; i++) {
      await db.client.notificationDelivery.update({
        where: { id: d.id },
        data: { availableAt: new Date(0) },
      });
      await worker.dispatch(d.id);
    }
    expect(provider.calls).toHaveLength(8);
    await worker.dispatch(d.id);
    expect(provider.calls).toHaveLength(8);
    expect(
      (
        await db.client.notificationDelivery.findUniqueOrThrow({
          where: { id: d.id },
        })
      ).status,
    ).toBe('REVIEW_REQUIRED');
    const next = await activity(owner);
    await worker.materialize(next.intent.id);
    const abandoned = await db.client.notificationDelivery.findFirstOrThrow({
      where: { notificationId: next.intent.id },
    });
    await db.client.notificationDelivery.update({
      where: { id: abandoned.id },
      data: {
        attempts: 8,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(0),
      },
    });
    await worker.dispatch(abandoned.id);
    expect(provider.calls).toHaveLength(8);
    expect(
      (
        await db.client.notificationDelivery.findUniqueOrThrow({
          where: { id: abandoned.id },
        })
      ).status,
    ).toBe('REVIEW_REQUIRED');
  });
  it('reads worker eligibility with identity signing/enrollment disabled', async () => {
    const owner = await actor(),
      noKeys = new NodeIdentityCrypto(
        new IdentityConfig({ NODE_ENV: 'test', AUTH_ENABLED: 'false' }),
      ),
      directory = new IdentityFacade(
        new SessionService(identityRepo, noKeys, tx, audit),
        noKeys,
        identityRepo,
      );
    expect(
      await tx.run((c) =>
        directory.notificationEligible(c, owner.userId, owner.sessionId),
      ),
    ).toBe(true);
    await tx.run(async (c) => {
      await identityRepo.lock(c, owner.userId);
      await identityRepo.revoke(c, owner.userId, new Date());
    });
    expect(
      await tx.run((c) =>
        directory.notificationEligible(c, owner.userId, owner.sessionId),
      ),
    ).toBe(false);
  });
});
