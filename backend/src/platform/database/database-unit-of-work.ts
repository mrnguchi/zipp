import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { UnitOfWork, AuditPort } from '../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../shared/contracts/unit-of-work.js';

@Injectable()
export class DatabaseUnitOfWork extends UnitOfWork {
  private readonly active = new WeakMap<
    TransactionContext,
    Prisma.TransactionClient
  >();
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {
    super();
  }

  async run<T>(
    operation: (context: TransactionContext) => Promise<T>,
  ): Promise<T> {
    // Only known rolled-back serialization/deadlock conflicts are retryable. Unknown
    // commit outcomes/timeouts must be resolved through the request's durable identity.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.database.client.$transaction(
          async (client) => {
            const context = Object.freeze({ id: randomUUID() });
            this.active.set(context, client);
            try {
              return await operation(context);
            } finally {
              this.active.delete(context);
            }
          },
          { maxWait: 2000, timeout: 5000 },
        );
      } catch (error) {
        const conflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            (error.code === 'P2010' &&
              ['40001', '40P01'].includes(String(error.meta?.['code']))));
        if (!conflict || attempt >= 2) throw error;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            20 * (attempt + 1) + Math.floor(Math.random() * 20),
          ),
        );
      }
    }
  }

  client(context: TransactionContext): Prisma.TransactionClient {
    const client = this.active.get(context);
    if (!client) throw new Error('Transaction context is not active');
    return client;
  }
}

@Injectable()
export class DatabaseAudit extends AuditPort {
  constructor(
    @Inject(DatabaseUnitOfWork)
    private readonly transactions: DatabaseUnitOfWork,
  ) {
    super();
  }
  async record(
    context: TransactionContext,
    actorId: string | null,
    action: string,
    subjectId?: string,
  ): Promise<void> {
    await this.transactions
      .client(context)
      // INSERT-only audit privilege: create() would require SELECT for RETURNING.
      .securityAudit.createMany({
        data: [{ actorId, action, subjectId: subjectId ?? actorId }],
      });
  }
}
