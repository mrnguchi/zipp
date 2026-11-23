import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
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
import { PrismaIdentityRepository } from '../../src/modules/identity/infrastructure/prisma-identity.repository.js';
import { NodeIdentityCrypto } from '../../src/modules/identity/infrastructure/identity-crypto.js';
import { SessionService } from '../../src/modules/identity/application/session.service.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { RidesFacade } from '../../src/modules/rides/rides.facade.js';
import { NotificationsFacade } from '../../src/modules/notifications/notifications.facade.js';
import { DeliveriesFacade } from '../../src/modules/deliveries/deliveries.facade.js';
import { CommunicationAccessService } from '../../src/modules/communications/application/communication-access.service.js';
import { CommunicationAdmissionService } from '../../src/modules/communications/application/communication-admission.service.js';
import { CommunicationCommandService } from '../../src/modules/communications/application/communication-command.service.js';
import { CommunicationReadService } from '../../src/modules/communications/application/communication-read.service.js';
import { CommunicationsRepository } from '../../src/modules/communications/application/communications.repository.js';
import { PrismaCommunicationsRepository } from '../../src/modules/communications/infrastructure/prisma-communications.repository.js';
import { CommunicationsConfig } from '../../src/modules/communications/communications.config.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import type { Actor, Role } from '../../src/shared/contracts/actor.js';
import { identityTestConfig } from '../helpers/identity-config.js';
// Written, not run. Real database/session/RBAC/constraint races; Redis and job-boundary
// doubles do not establish rate-limit or mobility correctness. Owning suites cover jobs.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error('Explicit isolated service test authorization required');
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test')
  throw new Error('Communications requires zipp_test');
describe('M7.2 durable communication races and recovery', () => {
  const db = new DatabaseService(config),
    tx = new DatabaseUnitOfWork(db),
    audit = new DatabaseAudit(tx),
    identityRepo = new PrismaIdentityRepository(db, tx),
    crypto = new NodeIdentityCrypto(identityTestConfig()),
    sessions = new SessionService(identityRepo, crypto, tx, audit),
    identity = new IdentityFacade(sessions, crypto, identityRepo),
    repo = new PrismaCommunicationsRepository(db, tx);
  let commands: CommunicationCommandService, reads: CommunicationReadService;
  const actors: Actor[] = [];
  beforeAll(async () => {
    await db.onModuleInit();
    const role = await db.client.$queryRaw<
      { current_user: string }[]
    >`SELECT current_user`;
    if (role[0]?.current_user !== 'zipp_app')
      throw new Error(
        'Communications privilege tests require restricted zipp_app',
      );
    await repo.assertSchema();
    const noJob = {
      communicationContext: () =>
        Promise.reject(new Error('Job fixture required')),
    };
    const module = await Test.createTestingModule({
      providers: [
        CommunicationAccessService,
        CommunicationAdmissionService,
        CommunicationCommandService,
        CommunicationReadService,
        { provide: UnitOfWork, useValue: tx },
        { provide: AuditPort, useValue: audit },
        { provide: IdentityFacade, useValue: identity },
        { provide: CommunicationsRepository, useValue: repo },
        { provide: RidesFacade, useValue: noJob },
        { provide: DeliveriesFacade, useValue: noJob },
        {
          provide: NotificationsFacade,
          useValue: { communicationActivity: () => Promise.resolve() },
        },
        {
          provide: RateLimitPort,
          useValue: { consume: () => Promise.resolve() },
        },
        {
          provide: CommunicationsConfig,
          useValue: new CommunicationsConfig({
            NODE_ENV: 'test',
            AUTH_ENABLED: 'true',
            COMMUNICATIONS_ENABLED: 'true',
          }),
        },
      ],
    }).compile();
    commands = module.get(CommunicationCommandService);
    reads = module.get(CommunicationReadService);
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
  async function actor(roles: Role[] = ['CUSTOMER'], mfa = false) {
    const user = await db.client.user.create({
      data: {
        phone: `+2376${randomInt(10000000, 100000000)}`,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        roles,
        twoFactorSecret: mfa ? 'isolated-mfa-presence-only' : null,
      },
    });
    const grant = await tx.run(async (c) => {
      await identityRepo.lock(c, user.id);
      return sessions.grant(c, user, mfa ? new Date() : null);
    });
    const a: Actor = {
      userId: user.id,
      sessionId: grant.session.id,
      roles,
      mfaEnabled: mfa,
      mfaVerifiedAt: grant.session.mfaVerifiedAt,
    };
    actors.push(a);
    return a;
  }
  const input = {
    subject: 'Isolated help request',
    category: 'ACCOUNT' as const,
    body: 'Private support fixture',
  };
  it('serializes duplicate ticket creates and keeps one initial message/event/receipt', async () => {
    const a = await actor(),
      key = randomUUID();
    const results = await Promise.all([
      commands.createTicket(a, key, input),
      commands.createTicket(a, key, input),
    ]);
    expect(results[0]).toEqual(results[1]);
    const id = results[0]?.threadId;
    expect(await db.client.communicationThread.count({ where: { id } })).toBe(
      1,
    );
    expect(
      await db.client.communicationMessage.count({ where: { threadId: id } }),
    ).toBe(1);
    expect(
      await db.client.communicationEvent.count({ where: { threadId: id } }),
    ).toBe(1);
    await expect(
      commands.createTicket(a, key, { ...input, body: 'Changed' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('deduplicates simultaneous sends and preserves gap-free sequence across different keys', async () => {
    const a = await actor(),
      ticket = await commands.createTicket(a, randomUUID(), input),
      key = randomUUID();
    const same = await Promise.all([
      commands.send(a, key, ticket.threadId, 'same'),
      commands.send(a, key, ticket.threadId, 'same'),
    ]);
    expect(same[0]).toEqual(same[1]);
    await Promise.all([
      commands.send(a, randomUUID(), ticket.threadId, 'one'),
      commands.send(a, randomUUID(), ticket.threadId, 'two'),
    ]);
    const history = await reads.history(a, ticket.threadId, 0, 50);
    expect(history.items.map((m) => m.sequence)).toEqual([1, 2, 3, 4]);
    expect(history.thread.version).toBe(4);
    expect(
      await db.client.communicationEvent.count({
        where: { threadId: ticket.threadId },
      }),
    ).toBe(4);
  });
  it('replays an accepted send after resolve, rejects new sends and stale status races', async () => {
    const a = await actor(),
      ticket = await commands.createTicket(a, randomUUID(), input),
      key = randomUUID(),
      sent = await commands.send(a, key, ticket.threadId, 'accepted');
    const results = await Promise.allSettled([
      commands.changeStatus(a, randomUUID(), ticket.threadId, {
        status: 'RESOLVED',
        expectedVersion: 2,
        reason: 'ANSWERED',
      }),
      commands.changeStatus(a, randomUUID(), ticket.threadId, {
        status: 'RESOLVED',
        expectedVersion: 2,
        reason: 'CUSTOMER_REQUEST',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await commands.send(a, key, ticket.threadId, 'accepted')).toEqual(
      sent,
    );
    await expect(
      commands.send(a, randomUUID(), ticket.threadId, 'new'),
    ).rejects.toMatchObject({ code: 'CONVERSATION_READ_ONLY' });
    expect((await reads.snapshot(a, ticket.threadId)).writable).toBe(false);
  });
  it('requires current support role and recent MFA for another owner', async () => {
    const owner = await actor(),
      stranger = await actor(),
      finance = await actor(['FINANCE'], true),
      noMfa = await actor(['SUPPORT']),
      support = await actor(['SUPPORT'], true),
      ticket = await commands.createTicket(owner, randomUUID(), input);
    for (const a of [stranger, finance, noMfa])
      await expect(
        reads.history(a, ticket.threadId, 0, 30),
      ).rejects.toBeDefined();
    expect(
      (await reads.history(support, ticket.threadId, 0, 30)).items,
    ).toHaveLength(1);
    // The actor object still says SUPPORT, but authoritative storage must win.
    await db.client.user.update({
      where: { id: support.userId },
      data: { roles: ['CUSTOMER'] },
    });
    await expect(
      reads.history(support, ticket.threadId, 0, 30),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('denies replay/history after session revocation', async () => {
    const a = await actor(),
      ticket = await commands.createTicket(a, randomUUID(), input),
      key = randomUUID();
    await commands.send(a, key, ticket.threadId, 'accepted');
    await tx.run(async (c) => {
      await identityRepo.lock(c, a.userId);
      await identityRepo.revoke(c, a.userId, new Date());
    });
    await expect(
      commands.send(a, key, ticket.threadId, 'accepted'),
    ).rejects.toBeDefined();
    await expect(reads.snapshot(a, ticket.threadId)).rejects.toBeDefined();
  });
  it('keeps read cursors monotonic under competing acknowledgements and rejects future cursor', async () => {
    const a = await actor(),
      ticket = await commands.createTicket(a, randomUUID(), input);
    await commands.send(a, randomUUID(), ticket.threadId, 'second');
    await Promise.all([
      reads.acknowledge(a, ticket.threadId, 2),
      reads.acknowledge(a, ticket.threadId, 1),
    ]);
    expect((await reads.snapshot(a, ticket.threadId)).readSequence).toBe(2);
    await expect(
      reads.acknowledge(a, ticket.threadId, 3),
    ).rejects.toMatchObject({ code: 'CURSOR_AHEAD' });
  });
  it('bounds open-ticket creation across competing unique keys', async () => {
    const a = await actor();
    for (let i = 0; i < 4; i++)
      await commands.createTicket(a, randomUUID(), input);
    const results = await Promise.allSettled([
      commands.createTicket(a, randomUUID(), input),
      commands.createTicket(a, randomUUID(), input),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.client.communicationThread.count({
        where: { creatorUserId: a.userId, status: 'OPEN' },
      }),
    ).toBe(5);
  });
  it('paginates immutable sequence history without an unrelated cursor bypass', async () => {
    const a = await actor(),
      ticket = await commands.createTicket(a, randomUUID(), input);
    await commands.send(a, randomUUID(), ticket.threadId, 'second');
    const page = await reads.history(a, ticket.threadId, 0, 1);
    expect(page.items.map((m) => m.sequence)).toEqual([1]);
    expect(page.nextAfter).toBe(1);
    expect(
      (await reads.history(a, ticket.threadId, 1, 1)).items.map(
        (m) => m.sequence,
      ),
    ).toEqual([2]);
    expect(
      (await reads.history(a, ticket.threadId, 1, 1)).nextAfter,
    ).toBeNull();
  });
  it('rolls back an orphan message with no matching aggregate/event and forbids history edits', async () => {
    const a = await actor(),
      ticket = await commands.createTicket(a, randomUUID(), input),
      id = randomUUID();
    await expect(
      tx.run((c) =>
        tx.client(c).communicationMessage.create({
          data: {
            id,
            threadId: ticket.threadId,
            sequence: 2,
            authorUserId: a.userId,
            body: 'must rollback',
          },
        }),
      ),
    ).rejects.toBeDefined();
    expect(
      await db.client.communicationMessage.findUnique({ where: { id } }),
    ).toBeNull();
    const first = await db.client.communicationMessage.findFirstOrThrow({
      where: { threadId: ticket.threadId },
    });
    await expect(
      db.client.communicationMessage.update({
        where: { id: first.id },
        data: { body: 'forbidden mutation' },
      }),
    ).rejects.toBeDefined();
    await expect(
      db.client.communicationMessage.delete({ where: { id: first.id } }),
    ).rejects.toBeDefined();
  });
});
