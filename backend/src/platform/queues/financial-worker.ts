import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { financialPaymentCommand } from '../../modules/finance/contracts/finance.schemas.js';
import { AppConfig } from '../../config/environment.js';
import { FinanceFacade } from '../../modules/finance/finance.facade.js';
import { FinanceConfig } from '../../modules/finance/finance.config.js';
import { AppLogger } from '../observability/app-logger.js';
import { queueConnection } from './queue-connection.js';

const QUEUE = 'financial-payments';

@Injectable()
export class FinancialWorker
  implements OnModuleInit, BeforeApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    @Inject(AppConfig) private readonly app: AppConfig,
    @Inject(FinanceConfig) private readonly config: FinanceConfig,
    @Inject(FinanceFacade) private readonly finance: FinanceFacade,
    @Inject(AppLogger) private readonly logger: AppLogger,
  ) {}
  onModuleInit(): void {
    if (!this.config.enabled) return;
    const connection = queueConnection(this.app.queueUrl);
    this.queue = new Queue(QUEUE, {
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        commandTimeout: 2000,
      },
    });
    this.queue.on('error', () =>
      this.logger.output.error('Financial queue unavailable'),
    );
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name !== 'resolve-payment')
          throw new Error('Unsupported financial job');
        const input = financialPaymentCommand.parse(job.data);
        await this.finance.executePaymentEvent(input.id);
      },
      { connection, concurrency: 2 },
    );
    this.worker.on('error', () =>
      this.logger.output.error('Financial worker unavailable'),
    );
    this.worker.on('failed', () =>
      this.logger.output.error('Financial job deferred for recovery'),
    );
    // Database rescans recover queued-but-lost commands; completed Redis jobs are not authority.
    this.timer = setInterval(() => this.schedule(), 2000);
    this.timer.unref();
    this.schedule();
  }
  private schedule(): void {
    if (this.stopping || this.running) return;
    this.running = this.relay()
      .catch(() => {
        this.logger.output.error('Financial outbox relay deferred');
      })
      .finally(() => {
        this.running = undefined;
      });
  }
  private async relay(): Promise<void> {
    for (const id of await this.finance.duePaymentEvents(20)) {
      if (this.stopping) break;
      // Short time bucket avoids stale retained queue IDs preventing database recovery.
      await this.queue?.add(
        'resolve-payment',
        { id, schemaVersion: 1 },
        {
          jobId: `${id}-${Math.floor(Date.now() / 2000)}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { age: 3600, count: 100 },
        },
      );
    }
  }
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
    await this.worker?.close();
    await this.queue?.close();
  }
}
