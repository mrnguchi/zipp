import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { AppConfig } from '../../config/environment.js';
import { DeliveriesFacade } from '../../modules/deliveries/deliveries.facade.js';
import { DeliveriesConfig } from '../../modules/deliveries/deliveries.config.js';
import { deliveryDispatchCommand } from '../../modules/deliveries/contracts/delivery.schemas.js';
import { queueConnection } from './queue-connection.js';
import { AppLogger } from '../observability/app-logger.js';
const QUEUE = 'delivery-dispatch';
@Injectable()
export class DeliveryDispatchWorker
  implements OnModuleInit, BeforeApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    @Inject(AppConfig) private readonly app: AppConfig,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
    @Inject(DeliveriesFacade) private readonly deliveries: DeliveriesFacade,
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
      this.logger.output.error('Delivery dispatch queue unavailable'),
    );
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name !== 'dispatch')
          throw new Error('Unsupported delivery command');
        const input = deliveryDispatchCommand.parse(job.data);
        await this.deliveries.executeDispatch(input.deliveryId);
      },
      { connection, concurrency: 2 },
    );
    this.worker.on('error', () =>
      this.logger.output.error('Delivery dispatch worker unavailable'),
    );
    this.worker.on('failed', () =>
      this.logger.output.error('Delivery dispatch deferred for recovery'),
    );
    this.timer = setInterval(() => this.schedule(), 2000);
    this.timer.unref();
    this.schedule();
  }
  private schedule(): void {
    if (this.stopping || this.running) return;
    this.running = this.relay()
      .catch(() => {
        this.logger.output.error('Delivery dispatch relay deferred');
      })
      .finally(() => {
        this.running = undefined;
      });
  }
  private async relay(): Promise<void> {
    for (const deliveryId of await this.deliveries.dueDispatchTasks(20)) {
      if (this.stopping) break;
      await this.queue?.add(
        'dispatch',
        { deliveryId, schemaVersion: 1 },
        {
          jobId: `${deliveryId}-${Math.floor(Date.now() / 2000)}`,
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
