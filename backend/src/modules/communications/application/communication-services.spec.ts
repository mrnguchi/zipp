import 'reflect-metadata';
import { randomUUID, createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { Actor } from '../../../shared/contracts/actor.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { NotificationsFacade } from '../../notifications/notifications.facade.js';
import { RidesFacade } from '../../rides/rides.facade.js';
import { DeliveriesFacade } from '../../deliveries/deliveries.facade.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CommunicationsConfig } from '../communications.config.js';
import { CommunicationsRepository } from './communications.repository.js';
import { CommunicationAccessService } from './communication-access.service.js';
import { CommunicationAdmissionService } from './communication-admission.service.js';
import { CommunicationCommandService } from './communication-command.service.js';
import { CommunicationReadService } from './communication-read.service.js';
import type { ThreadRecord } from '../contracts/communication-records.js';
describe('authorized communication commands/recovery (written, not run)', () => {
  const actor: Actor = {
    userId: randomUUID(),
    sessionId: randomUUID(),
    roles: ['CUSTOMER'],
    mfaEnabled: false,
    mfaVerifiedAt: null,
  };
  const context = { id: randomUUID() };
  let commands: CommunicationCommandService, reads: CommunicationReadService;
  let thread: ThreadRecord;
  const repo = {
    thread: jest.fn<CommunicationsRepository['thread']>(),
    lock: jest.fn<CommunicationsRepository['lock']>(),
    jobThread: jest.fn<CommunicationsRepository['jobThread']>(),
    create: jest.fn<CommunicationsRepository['create']>(),
    command: jest.fn<CommunicationsRepository['command']>(),
    receipt: jest.fn<CommunicationsRepository['receipt']>(),
    append: jest.fn<CommunicationsRepository['append']>(),
    event: jest.fn<CommunicationsRepository['event']>(),
    status: jest.fn<CommunicationsRepository['status']>(),
    openTicketCount: jest.fn<CommunicationsRepository['openTicketCount']>(),
    messages: jest.fn<CommunicationsRepository['messages']>(),
    readCursor: jest.fn<CommunicationsRepository['readCursor']>(),
    acknowledge: jest.fn<CommunicationsRepository['acknowledge']>(),
    tickets: jest.fn<CommunicationsRepository['tickets']>(),
  };
  const authorize = jest.fn<IdentityFacade['authorize']>();
  const job = jest.fn<RidesFacade['communicationContext']>();
  const consume = jest.fn<RateLimitPort['consume']>();
  const audit = jest.fn<AuditPort['record']>();
  const notify = jest.fn<NotificationsFacade['communicationActivity']>();
  const pseudonym = (purpose: string, value: string) =>
    createHmac('sha256', 'unit-only-key')
      .update(purpose + value)
      .digest('hex');
  beforeEach(async () => {
    jest.resetAllMocks();
    thread = {
      id: randomUUID(),
      kind: 'SUPPORT',
      creatorUserId: actor.userId,
      jobId: null,
      jobType: null,
      subject: 'Help',
      category: 'ACCOUNT',
      status: 'OPEN',
      version: 2,
      lastSequence: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repo.thread.mockImplementation(() => Promise.resolve(thread));
    repo.lock.mockImplementation(() => Promise.resolve(thread));
    repo.jobThread.mockResolvedValue(null);
    repo.command.mockResolvedValue(null);
    repo.openTicketCount.mockResolvedValue(0);
    repo.readCursor.mockResolvedValue(0);
    repo.messages.mockResolvedValue([]);
    repo.tickets.mockResolvedValue([]);
    authorize.mockResolvedValue(actor);
    job.mockResolvedValue({
      writable: true,
      participantUserIds: [actor.userId],
    });
    repo.event.mockResolvedValue(randomUUID());
    consume.mockResolvedValue();
    const module = await Test.createTestingModule({
      providers: [
        CommunicationAccessService,
        CommunicationAdmissionService,
        CommunicationCommandService,
        CommunicationReadService,
        {
          provide: CommunicationsConfig,
          useValue: new CommunicationsConfig({
            NODE_ENV: 'test',
            AUTH_ENABLED: 'true',
            COMMUNICATIONS_ENABLED: 'true',
          }),
        },
        { provide: CommunicationsRepository, useValue: repo },
        { provide: AuditPort, useValue: { record: audit } },
        {
          provide: NotificationsFacade,
          useValue: { communicationActivity: notify },
        },
        { provide: IdentityFacade, useValue: { authorize, pseudonym } },
        { provide: RidesFacade, useValue: { communicationContext: job } },
        { provide: DeliveriesFacade, useValue: { communicationContext: job } },
        { provide: RateLimitPort, useValue: { consume } },
        {
          provide: UnitOfWork,
          useValue: {
            run: <T>(operation: (c: TransactionContext) => Promise<T>) =>
              operation(context),
          },
        },
      ],
    }).compile();
    commands = module.get(CommunicationCommandService);
    reads = module.get(CommunicationReadService);
  });
  it('persists message, receipt and reference-only intent within the same context', async () => {
    const key = randomUUID();
    const result = await commands.send(actor, key, thread.id, 'private body');
    expect(result).toMatchObject({
      threadId: thread.id,
      sequence: 2,
      version: 3,
    });
    expect(repo.append).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ version: 3, lastSequence: 2 }),
      expect.objectContaining({ body: 'private body', sequence: 2 }),
    );
    expect(repo.event).toHaveBeenCalledWith(
      context,
      thread.id,
      3,
      'message.sent',
      actor.userId,
      2,
    );
    expect(repo.receipt).toHaveBeenCalledWith(
      context,
      actor.userId,
      'message.send',
      key,
      expect.any(String),
      result,
    );
    expect(JSON.stringify(repo.event.mock.calls)).not.toContain('private body');
    expect(notify).toHaveBeenCalledWith(
      context,
      expect.any(String),
      actor.userId,
      [actor.userId],
    );
    expect(JSON.stringify(notify.mock.calls)).not.toContain('private body');
  });
  it('replays the original receipt after a ticket becomes read-only', async () => {
    thread.status = 'RESOLVED';
    const receipt = {
      threadId: thread.id,
      messageId: randomUUID(),
      sequence: 1,
      version: 2,
    };
    repo.command.mockResolvedValue({
      ...receipt,
      fingerprint: pseudonym(
        'communications:message.send',
        JSON.stringify([thread.id, 'same']),
      ),
    });
    expect(await commands.send(actor, randomUUID(), thread.id, 'same')).toEqual(
      receipt,
    );
    expect(authorize).toHaveBeenCalled();
    expect(repo.append).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
  it('returns canonical IDs even when the first transport path uses uppercase UUIDs', async () => {
    const result = await commands.send(
      actor,
      randomUUID(),
      thread.id.toUpperCase(),
      'same',
    );
    expect(result.threadId).toBe(thread.id);
    expect(repo.receipt).toHaveBeenCalledWith(
      context,
      actor.userId,
      'message.send',
      expect.any(String),
      expect.any(String),
      result,
    );
  });
  it('rejects changed input on an old key', async () => {
    repo.command.mockResolvedValue({
      threadId: thread.id,
      messageId: randomUUID(),
      sequence: 1,
      version: 2,
      fingerprint: 'different',
    });
    await expect(
      commands.send(actor, randomUUID(), thread.id, 'changed'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(repo.append).not.toHaveBeenCalled();
  });
  it('denies revoked sessions even when a prior receipt exists', async () => {
    authorize.mockRejectedValue(
      new BusinessError('UNAUTHENTICATED', 'Sign in'),
    );
    await expect(
      commands.send(actor, randomUUID(), thread.id, 'same'),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(repo.command).not.toHaveBeenCalled();
  });
  it('requires fresh support role and MFA for another owner ticket', async () => {
    thread.creatorUserId = randomUUID();
    authorize.mockRejectedValue(new BusinessError('FORBIDDEN', 'Denied'));
    await expect(reads.snapshot(actor, thread.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(authorize).toHaveBeenCalledWith(
      context,
      actor,
      ['SUPPORT', 'ADMIN'],
      true,
      [thread.creatorUserId],
    );
    expect(repo.lock).not.toHaveBeenCalled();
  });
  it('routes job access through owning facade, never through a staff role shortcut', async () => {
    thread.kind = 'JOB';
    thread.jobId = randomUUID();
    thread.jobType = 'DELIVERY';
    thread.subject = null;
    thread.category = null;
    job.mockRejectedValue(new BusinessError('NOT_FOUND', 'Denied'));
    await expect(reads.history(actor, thread.id, 0, 30)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repo.messages).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled();
  });
  it('rejects new job sends after completion but leaves history readable', async () => {
    thread.kind = 'JOB';
    thread.jobId = randomUUID();
    thread.jobType = 'RIDE';
    job.mockResolvedValue({
      writable: false,
      participantUserIds: [actor.userId],
    });
    await expect(
      commands.send(actor, randomUUID(), thread.id, 'new'),
    ).rejects.toMatchObject({ code: 'CONVERSATION_READ_ONLY' });
    expect((await reads.snapshot(actor, thread.id)).writable).toBe(false);
  });
  it('does not create a fresh conversation after the job ends', async () => {
    job.mockResolvedValue({
      writable: false,
      participantUserIds: [actor.userId],
    });
    await expect(
      commands.openJob(actor, { jobType: 'RIDE', jobId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_READ_ONLY' });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it('keeps read acknowledgements monotonic and bounded by committed history', async () => {
    thread.lastSequence = 10;
    repo.readCursor.mockResolvedValue(8);
    expect(await reads.acknowledge(actor, thread.id, 3)).toEqual({
      readSequence: 8,
    });
    await expect(reads.acknowledge(actor, thread.id, 11)).rejects.toMatchObject(
      { code: 'CURSOR_AHEAD' },
    );
    expect(repo.acknowledge).toHaveBeenCalledTimes(1);
  });
  it('does not persist on admission failure or state version conflict', async () => {
    consume.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(
      commands.send(actor, randomUUID(), thread.id, 'hello'),
    ).rejects.toThrow();
    expect(repo.thread).not.toHaveBeenCalled();
    await expect(
      commands.changeStatus(actor, randomUUID(), thread.id, {
        status: 'RESOLVED',
        expectedVersion: 1,
        reason: 'ANSWERED',
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(repo.status).not.toHaveBeenCalled();
  });
  it('enforces open-ticket limits after replay lookup and audits controlled status', async () => {
    repo.openTicketCount.mockResolvedValue(5);
    await expect(
      commands.createTicket(actor, randomUUID(), {
        subject: 'Need help',
        category: 'ACCOUNT',
        body: 'Help',
      }),
    ).rejects.toMatchObject({ code: 'TICKET_LIMIT' });
    expect(repo.create).not.toHaveBeenCalled();
    await commands.changeStatus(actor, randomUUID(), thread.id, {
      status: 'RESOLVED',
      expectedVersion: 2,
      reason: 'ANSWERED',
    });
    expect(audit).toHaveBeenCalledWith(
      context,
      actor.userId,
      'communications.ticket_resolved',
      thread.id,
    );
  });
});
