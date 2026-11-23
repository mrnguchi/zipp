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
import { FinanceFacade } from '../../src/modules/finance/finance.facade.js';
import { DeliveriesFacade } from '../../src/modules/deliveries/deliveries.facade.js';
import { OperationsService } from '../../src/modules/operations/application/operations.service.js';
import { OperationsSubjectsService } from '../../src/modules/operations/application/operations-subjects.service.js';
import { OperationsRepository } from '../../src/modules/operations/application/operations.repository.js';
import { PrismaOperationsRepository } from '../../src/modules/operations/infrastructure/prisma-operations.repository.js';
import { OperationsConfig } from '../../src/modules/operations/operations.config.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import { BusinessError } from '../../src/shared/errors/business-error.js';
import type { Actor, Role } from '../../src/shared/contracts/actor.js';
import { identityTestConfig } from '../helpers/identity-config.js';
// Written, unrun: real restricted PostgreSQL/session/case history/rollback. Job,
// finance guard and Redis admission doubles do not establish their correctness.
if (
  process.env['RUN_SERVICE_TESTS'] !== 'true' ||
  process.env['NODE_ENV'] !== 'test'
)
  throw new Error('Explicit isolated service test authorization required');
const config = parseEnvironment(process.env);
if (new URL(config.databaseUrl).pathname !== '/zipp_test')
  throw new Error('Operations requires isolated zipp_test');
describe('M7.5 durable staff case controls', () => {
  const db = new DatabaseService(config),
    tx = new DatabaseUnitOfWork(db),
    audit = new DatabaseAudit(tx),
    identityRepo = new PrismaIdentityRepository(db, tx),
    crypto = new NodeIdentityCrypto(identityTestConfig()),
    sessions = new SessionService(identityRepo, crypto, tx, audit),
    identity = new IdentityFacade(sessions, crypto, identityRepo),
    repo = new PrismaOperationsRepository(db, tx),
    actors: Actor[] = [];
  let service: OperationsService,
    guardBlocked = false;
  beforeAll(async () => {
    await db.onModuleInit();
    const roles = await db.client.$queryRaw<
      { current_user: string }[]
    >`SELECT current_user`;
    if (roles[0]?.current_user !== 'zipp_app')
      throw new Error('Restricted zipp_app required');
    await repo.assertSchema();
    const module = await Test.createTestingModule({
      providers: [
        OperationsService,
        {
          provide: DeliveriesFacade,
          useValue: { assertOperationsCanSuspend: () => Promise.resolve() },
        },
        { provide: UnitOfWork, useValue: tx },
        { provide: AuditPort, useValue: audit },
        { provide: IdentityFacade, useValue: identity },
        { provide: OperationsRepository, useValue: repo },
        {
          provide: OperationsConfig,
          useValue: new OperationsConfig({
            OPERATIONS_ENABLED: 'true',
            AUTH_ENABLED: 'true',
          }),
        },
        {
          provide: RateLimitPort,
          useValue: { consume: () => Promise.resolve() },
        },
        {
          provide: OperationsSubjectsService,
          useValue: {
            summary: (
              c: Parameters<IdentityFacade['operationsSummary']>[0],
              a: Actor,
              type: string,
              id: string,
            ) => {
              if (type !== 'ACCOUNT')
                throw new Error('Explicit owner fixture required');
              return identity.operationsSummary(c, a, id);
            },
          },
        },
        {
          provide: FinanceFacade,
          useValue: {
            assertOperationsCanSuspend: () => {
              if (guardBlocked)
                throw new BusinessError(
                  'ACTIVE_JOB_CONFLICT',
                  'Active isolated job',
                );
              return Promise.resolve();
            },
          },
        },
      ],
    }).compile();
    service = module.get(OperationsService);
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
  async function actor(roles: Role[] = ['CUSTOMER'], mfa = true) {
    const u = await db.client.user.create({
      data: {
        phone: `+2376${randomInt(10000000, 100000000)}`,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        roles,
        twoFactorSecret: mfa ? 'isolated-mfa-presence-only' : null,
      },
    });
    const grant = await tx.run(async (c) => {
      await identityRepo.lock(c, u.id);
      return sessions.grant(c, u, mfa ? new Date() : null);
    });
    const a: Actor = {
      userId: u.id,
      sessionId: grant.session.id,
      roles,
      mfaEnabled: mfa,
      mfaVerifiedAt: grant.session.mfaVerifiedAt,
    };
    actors.push(a);
    return a;
  }
  const input = (id: string) => ({
    subjectType: 'ACCOUNT' as const,
    subjectId: id,
    reasonCode: 'SAFETY_CONCERN' as const,
    description: 'Private isolated allegation, not confirmed fraud.',
  });
  it('serializes duplicate creation and rejects changed input without echoing descriptions in receipts', async () => {
    const staff = await actor(['SUPPORT']),
      target = await actor(),
      key = randomUUID();
    const [a, b] = await Promise.all([
      service.open(staff, key, input(target.userId)),
      service.open(staff, key, input(target.userId)),
    ]);
    expect(a).toEqual(b);
    expect(
      await db.client.operationsCaseEvent.count({
        where: { caseId: a.caseId },
      }),
    ).toBe(1);
    expect(JSON.stringify(a)).not.toContain('Private');
    await expect(
      service.open(staff, key, {
        ...input(target.userId),
        description: 'Changed private description',
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('rechecks current role/MFA on reads and replay; finance alone cannot inspect a support case', async () => {
    const staff = await actor(['SUPPORT']),
      finance = await actor(['FINANCE']),
      target = await actor(),
      noMfa = await actor(['SUPPORT'], false),
      key = randomUUID(),
      r = await service.open(staff, key, input(target.userId));
    await expect(service.get(finance, r.caseId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.get(noMfa, r.caseId)).rejects.toMatchObject({
      code: 'RECENT_MFA_REQUIRED',
    });
    await db.client.user.update({
      where: { id: staff.userId },
      data: { roles: ['CUSTOMER'] },
    });
    await expect(
      service.open(staff, key, input(target.userId)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('chooses one concurrent versioned review and keeps an append-only contiguous history', async () => {
    const staff = await actor(['SUPPORT']),
      target = await actor(),
      r = await service.open(staff, randomUUID(), input(target.userId));
    const results = await Promise.allSettled([
      service.review(staff, randomUUID(), r.caseId, {
        expectedVersion: 1,
        status: 'IN_REVIEW',
        reasonCode: 'OTHER',
      }),
      service.review(staff, randomUUID(), r.caseId, {
        expectedVersion: 1,
        status: 'DISMISSED',
        reasonCode: 'INSUFFICIENT_EVIDENCE',
      }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await service.events(staff, r.caseId, 0, 50)).items.map(
        (x) => x.version,
      ),
    ).toEqual([1, 2]);
    await expect(
      db.client
        .$executeRaw`DELETE FROM operations_case_events WHERE case_id=${r.caseId}::uuid`,
    ).rejects.toBeDefined();
    await expect(
      tx.run(async (c) => {
        const row = await repo.get(c, r.caseId, true);
        if (!row) throw new Error('fixture');
        row.version++;
        await repo.save(c, row);
      }),
    ).rejects.toBeDefined();
  });
  it('commits suspension with session revocation and replay but rolls back blocked custody/payment changes', async () => {
    const admin = await actor(['ADMIN']),
      target = await actor(),
      r = await service.open(admin, randomUUID(), input(target.userId));
    await service.review(admin, randomUUID(), r.caseId, {
      expectedVersion: 1,
      status: 'IN_REVIEW',
      reasonCode: 'OTHER',
    });
    const change = {
        expectedVersion: 2,
        expectedAccountStatus: 'ACTIVE' as const,
        accountStatus: 'SUSPENDED' as const,
        reasonCode: 'SAFETY_CONCERN' as const,
      },
      key = randomUUID();
    guardBlocked = true;
    try {
      await expect(
        service.accountStatus(admin, key, r.caseId, change),
      ).rejects.toMatchObject({ code: 'ACTIVE_JOB_CONFLICT' });
    } finally {
      guardBlocked = false;
    }
    expect(
      (await db.client.user.findUniqueOrThrow({ where: { id: target.userId } }))
        .status,
    ).toBe('ACTIVE');
    expect((await service.get(admin, r.caseId)).version).toBe(2);
    const result = await service.accountStatus(admin, key, r.caseId, change);
    expect(result.accountStatus).toBe('SUSPENDED');
    expect(await service.accountStatus(admin, key, r.caseId, change)).toEqual(
      result,
    );
    expect(
      (
        await db.client.authSession.findUniqueOrThrow({
          where: { id: target.sessionId },
        })
      ).revokedAt,
    ).not.toBeNull();
    await service.accountStatus(admin, randomUUID(), r.caseId, {
      expectedVersion: 3,
      expectedAccountStatus: 'SUSPENDED',
      accountStatus: 'ACTIVE',
      reasonCode: 'REVIEW_COMPLETED',
    });
    expect(
      (
        await db.client.authSession.findUniqueOrThrow({
          where: { id: target.sessionId },
        })
      ).revokedAt,
    ).not.toBeNull();
  });
  it('denies self or any staff-target status mutation', async () => {
    const admin = await actor(['ADMIN']),
      r = await service.open(admin, randomUUID(), input(admin.userId));
    await service.review(admin, randomUUID(), r.caseId, {
      expectedVersion: 1,
      status: 'IN_REVIEW',
      reasonCode: 'OTHER',
    });
    await expect(
      service.accountStatus(admin, randomUUID(), r.caseId, {
        expectedVersion: 2,
        expectedAccountStatus: 'ACTIVE',
        accountStatus: 'SUSPENDED',
        reasonCode: 'OTHER',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
