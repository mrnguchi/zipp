import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationAdmissionService } from './notification-admission.service.js';
import type { NotificationPage } from '../contracts/notification.schemas.js';
import { inboxView } from '../contracts/notification-records.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class NotificationInboxService {
  constructor(
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(NotificationsRepository)
    private readonly repo: NotificationsRepository,
    @Inject(NotificationAdmissionService)
    private readonly admission: NotificationAdmissionService,
  ) {}
  async list(a: Actor, query: NotificationPage) {
    await this.admission.admit(a);
    return this.tx.run(async (c) => {
      await this.identity.authorize(c, a);
      const rows = await this.repo.inbox(c, a.userId, query);
      return {
        items: rows.slice(0, query.limit).map(inboxView),
        nextCursor:
          rows.length > query.limit
            ? (rows[query.limit - 1]?.id ?? null)
            : null,
      };
    });
  }
  async read(a: Actor, id: string) {
    await this.admission.admit(a);
    return this.tx.run(async (c) => {
      await this.identity.authorize(c, a);
      const row = await this.repo.readInbox(
        c,
        a.userId,
        id,
        await this.repo.now(c),
      );
      if (!row) throw new BusinessError('NOT_FOUND', 'Notification not found');
      return inboxView(row);
    });
  }
}
