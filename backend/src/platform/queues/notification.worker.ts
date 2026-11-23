import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { NotificationsFacade } from '../../modules/notifications/notifications.facade.js';
import { NotificationsConfig } from '../../modules/notifications/notifications.config.js';
import { notificationCommand } from '../../modules/notifications/contracts/notification.schemas.js';
import { AppConfig } from '../../config/environment.js';
import { AppLogger } from '../observability/app-logger.js';
import { queueConnection } from './queue-connection.js';
const QUEUE = 'notification-delivery';
@Injectable()
export class NotificationWorker
  implements OnModuleInit, BeforeApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    @Inject(AppConfig) private readonly app: AppConfig,
    @Inject(NotificationsConfig) private readonly config: NotificationsConfig,
    @Inject(NotificationsFacade)
    private readonly notifications: NotificationsFacade,
    @Inject(AppLogger) private readonly logger: AppLogger,
  ) {}
  onModuleInit() {
    if (!this.config.dispatchEnabled) return;
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
      this.logger.output.error('Notification queue unavailable'),
    );
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        try {
          if (job.name !== 'process')
            throw new Error('Unsupported notification command');
          const input = notificationCommand.parse(job.data);
          if (input.kind === 'MATERIALIZE')
            await this.notifications.materialize(input.id);
          else await this.notifications.dispatch(input.id);
        } catch {
          // BullMQ persists failure reason/stack. Never persist raw dependency or input errors there.
          throw new Error('Notification processing deferred');
        }
      },
      { connection, concurrency: 2, limiter: { max: 20, duration: 1000 } },
    );
    this.worker.on('error', () =>
      this.logger.output.error('Notification worker unavailable'),
    );
    this.worker.on('failed', () =>
      this.logger.output.error('Notification work deferred'),
    );
    this.timer = setInterval(() => this.schedule(), 2000);
    this.timer.unref();
    this.schedule();
  }
  private schedule() {
    if (this.stopping || this.running) return;
    this.running = this.relay()
      .catch(() => this.logger.output.error('Notification relay deferred'))
      .finally(() => {
        this.running = undefined;
      });
  }
  private async relay() {
    for (const item of await this.notifications.due()) {
      if (this.stopping) break;
      await this.queue?.add(
        'process',
        { schemaVersion: 1, ...item },
        {
          jobId: `${item.kind}-${item.id}-${Math.floor(Date.now() / 2000)}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: { age: 3600, count: 100 },
        },
      );
    }
  }
  async beforeApplicationShutdown() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
    await this.worker?.close();
    await this.queue?.close();
  }
}
