import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { CommunicationAccessService } from './communication-access.service.js';
import { CommunicationAdmissionService } from './communication-admission.service.js';
import { CommunicationsRepository } from './communications.repository.js';
import type { TicketQuery } from '../contracts/communication.schemas.js';
import { threadView } from '../contracts/communication-records.js';
import { nextReadCursor } from '../domain/communication-rules.js';
@Injectable()
export class CommunicationReadService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(CommunicationAccessService)
    private readonly access: CommunicationAccessService,
    @Inject(CommunicationAdmissionService)
    private readonly admission: CommunicationAdmissionService,
    @Inject(CommunicationsRepository)
    private readonly repo: CommunicationsRepository,
  ) {}
  async snapshot(a: Actor, id: string) {
    await this.admission.admit(a, 'read');
    return this.tx.run(async (c) => {
      const { thread, writable } = await this.access.thread(c, a, id);
      return {
        ...threadView(thread, writable),
        readSequence: await this.repo.readCursor(c, id, a.userId),
      };
    });
  }
  async history(a: Actor, id: string, after: number, limit: number) {
    await this.admission.admit(a, 'read');
    return this.tx.run(async (c) => {
      const { thread, writable } = await this.access.thread(c, a, id);
      const rows = await this.repo.messages(c, id, after, limit);
      return {
        thread: threadView(thread, writable),
        items: rows.slice(0, limit).map((m) => ({
          id: m.id,
          sequence: m.sequence,
          authorUserId: m.authorUserId,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
        nextAfter:
          rows.length > limit ? (rows[limit - 1]?.sequence ?? null) : null,
        readSequence: await this.repo.readCursor(c, id, a.userId),
      };
    });
  }
  async acknowledge(a: Actor, id: string, sequence: number) {
    await this.admission.admit(a, 'ack');
    return this.tx.run(async (c) => {
      const { thread } = await this.access.thread(c, a, id);
      const current = await this.repo.readCursor(c, id, a.userId);
      const next = nextReadCursor(current, sequence, thread.lastSequence);
      await this.repo.acknowledge(c, id, a.userId, next);
      return { readSequence: next };
    });
  }
  async tickets(a: Actor, query: TicketQuery, staff = false) {
    await this.admission.admit(a, 'read');
    return this.tx.run(async (c) => {
      await this.access.identity.authorize(
        c,
        a,
        staff ? ['SUPPORT', 'ADMIN'] : [],
        staff,
      );
      const rows = await this.repo.tickets(c, staff ? null : a.userId, query);
      return {
        items: rows
          .slice(0, query.limit)
          .map((t) => threadView(t, t.status === 'OPEN')),
        nextCursor:
          rows.length > query.limit
            ? (rows[query.limit - 1]?.id ?? null)
            : null,
      };
    });
  }
}
