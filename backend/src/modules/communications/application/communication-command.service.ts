import { randomUUID } from 'node:crypto';
import { NotificationsFacade } from '../../notifications/notifications.facade.js';
import { Inject, Injectable } from '@nestjs/common';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CommunicationAccessService } from './communication-access.service.js';
import { CommunicationAdmissionService } from './communication-admission.service.js';
import { CommunicationsRepository } from './communications.repository.js';
import type {
  JobContext,
  TicketInput,
  StatusInput,
} from '../contracts/communication.schemas.js';
import type {
  ThreadRecord,
  CommandReceipt,
} from '../contracts/communication-records.js';
import { threadView } from '../contracts/communication-records.js';
import {
  assertWritable,
  assertBodyBytes,
  assertStatusChange,
} from '../domain/communication-rules.js';
@Injectable()
export class CommunicationCommandService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(CommunicationAccessService)
    private readonly access: CommunicationAccessService,
    @Inject(CommunicationAdmissionService)
    private readonly admission: CommunicationAdmissionService,
    @Inject(CommunicationsRepository)
    private readonly repo: CommunicationsRepository,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(NotificationsFacade)
    private readonly notifications: NotificationsFacade,
  ) {}
  private fingerprint(operation: string, input: unknown) {
    return this.access.identity.pseudonym(
      `communications:${operation}`,
      JSON.stringify(input),
    );
  }
  private async replay(
    c: TransactionContext,
    a: Actor,
    operation: string,
    key: string,
    fingerprint: string,
  ) {
    const previous = await this.repo.command(c, a.userId, operation, key);
    if (!previous) return null;
    if (previous.fingerprint !== fingerprint)
      throw new BusinessError(
        'IDEMPOTENCY_CONFLICT',
        'Key was used with different input',
      );
    // Return the immutable command receipt, not a stale copied conversation/body.
    return {
      threadId: previous.threadId,
      messageId: previous.messageId,
      sequence: previous.sequence,
      version: previous.version,
    };
  }
  async openJob(a: Actor, job: JobContext) {
    await this.admission.admit(a, 'open');
    return this.tx.run(async (c) => {
      const { writable } = await this.access.job(c, a, job);
      const existing = await this.repo.jobThread(c, job);
      if (existing)
        return threadView(await this.repo.lock(c, existing.id), writable);
      assertWritable(writable, 0);
      const thread = this.newThread(a, 'JOB', job);
      await this.repo.create(c, thread);
      await this.repo.event(c, thread.id, 1, 'conversation.opened', a.userId);
      await this.audit.record(
        c,
        a.userId,
        'communications.job_opened',
        thread.id,
      );
      return threadView(thread, true);
    });
  }
  private newThread(
    a: Actor,
    kind: 'JOB' | 'SUPPORT',
    job?: JobContext,
  ): ThreadRecord {
    const now = new Date();
    return {
      id: randomUUID(),
      kind,
      creatorUserId: a.userId,
      jobId: job?.jobId.toLowerCase() ?? null,
      jobType: job?.jobType ?? null,
      subject: null,
      category: null,
      status: 'OPEN',
      version: 1,
      lastSequence: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
  async createTicket(
    a: Actor,
    key: string,
    input: TicketInput,
  ): Promise<CommandReceipt> {
    assertBodyBytes(input.body);
    await this.admission.admit(a, 'create');
    const fingerprint = this.fingerprint('ticket.create', [
      input.subject,
      input.category,
      input.body,
      input.job?.jobType ?? null,
      input.job?.jobId.toLowerCase() ?? null,
    ]);
    return this.tx.run(async (c) => {
      if (input.job) await this.access.job(c, a, input.job);
      else await this.access.identity.authorize(c, a);
      const previous = await this.replay(
        c,
        a,
        'ticket.create',
        key,
        fingerprint,
      );
      if (previous) return previous;
      if ((await this.repo.openTicketCount(c, a.userId)) >= 5)
        throw new BusinessError(
          'TICKET_LIMIT',
          'Resolve an open ticket before creating another',
        );
      const thread = this.newThread(a, 'SUPPORT', input.job);
      thread.subject = input.subject;
      thread.category = input.category;
      thread.lastSequence = 1;
      const messageId = randomUUID();
      await this.repo.create(c, thread);
      await this.repo.append(c, thread, {
        id: messageId,
        threadId: thread.id,
        sequence: 1,
        authorUserId: a.userId,
        body: input.body,
        createdAt: thread.createdAt,
      });
      await this.repo.event(c, thread.id, 1, 'ticket.opened', a.userId, 1);
      const receipt = {
        threadId: thread.id,
        messageId,
        sequence: 1,
        version: 1,
      };
      await this.repo.receipt(
        c,
        a.userId,
        'ticket.create',
        key,
        fingerprint,
        receipt,
      );
      await this.audit.record(
        c,
        a.userId,
        'communications.ticket_opened',
        thread.id,
      );
      return receipt;
    });
  }
  async send(
    a: Actor,
    key: string,
    id: string,
    body: string,
  ): Promise<CommandReceipt> {
    assertBodyBytes(body);
    await this.admission.admit(a, 'send');
    const fingerprint = this.fingerprint('message.send', [
      id.toLowerCase(),
      body,
    ]);
    return this.tx.run(async (c) => {
      const { thread, writable, participantUserIds } = await this.access.thread(
        c,
        a,
        id,
      );
      const previous = await this.replay(
        c,
        a,
        'message.send',
        key,
        fingerprint,
      );
      if (previous) return previous;
      assertWritable(writable, thread.lastSequence);
      if (thread.version >= 1000000)
        throw new BusinessError(
          'VERSION_LIMIT',
          'Conversation version limit reached',
        );
      const updated = {
        ...thread,
        version: thread.version + 1,
        lastSequence: thread.lastSequence + 1,
      };
      const messageId = randomUUID();
      await this.repo.append(c, updated, {
        id: messageId,
        threadId: thread.id,
        sequence: updated.lastSequence,
        authorUserId: a.userId,
        body,
        createdAt: new Date(),
      });
      const eventId = await this.repo.event(
        c,
        id,
        updated.version,
        'message.sent',
        a.userId,
        updated.lastSequence,
      );
      await this.notifications.communicationActivity(
        c,
        eventId,
        a.userId,
        participantUserIds,
      );
      const receipt = {
        threadId: thread.id,
        messageId,
        sequence: updated.lastSequence,
        version: updated.version,
      };
      await this.repo.receipt(
        c,
        a.userId,
        'message.send',
        key,
        fingerprint,
        receipt,
      );
      return receipt;
    });
  }
  async changeStatus(
    a: Actor,
    key: string,
    id: string,
    input: StatusInput,
  ): Promise<CommandReceipt> {
    await this.admission.admit(a, 'status');
    const fingerprint = this.fingerprint('ticket.status', [
      id.toLowerCase(),
      input.status,
      input.expectedVersion,
      input.reason,
    ]);
    return this.tx.run(async (c) => {
      const { thread } = await this.access.thread(c, a, id);
      if (thread.kind !== 'SUPPORT')
        throw new BusinessError('NOT_FOUND', 'Ticket not found');
      const previous = await this.replay(
        c,
        a,
        'ticket.status',
        key,
        fingerprint,
      );
      if (previous) return previous;
      assertStatusChange(
        thread.status,
        input.status,
        thread.version,
        input.expectedVersion,
      );
      if (
        input.status === 'OPEN' &&
        (await this.repo.openTicketCount(c, thread.creatorUserId)) >= 5
      )
        throw new BusinessError('TICKET_LIMIT', 'Open ticket limit reached');
      await this.repo.status(c, id, input.status, thread.version + 1);
      const eventId = await this.repo.event(
        c,
        id,
        thread.version + 1,
        input.status === 'OPEN' ? 'ticket.reopened' : 'ticket.resolved',
        a.userId,
        undefined,
        input.reason,
      );
      await this.notifications.communicationActivity(c, eventId, a.userId, [
        thread.creatorUserId,
      ]);
      const receipt = {
        threadId: thread.id,
        messageId: null,
        sequence: null,
        version: thread.version + 1,
      };
      await this.repo.receipt(
        c,
        a.userId,
        'ticket.status',
        key,
        fingerprint,
        receipt,
      );
      await this.audit.record(
        c,
        a.userId,
        `communications.ticket_${input.status.toLowerCase()}`,
        id,
      );
      return receipt;
    });
  }
}
