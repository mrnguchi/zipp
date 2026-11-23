import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { AppConfig } from '../../config/environment.js';
import { RidesFacade } from '../../modules/rides/rides.facade.js';
import { RidesConfig } from '../../modules/rides/rides.config.js';
import { rideWorkCommand } from '../../modules/rides/contracts/ride.schemas.js';
import { queueConnection } from './queue-connection.js';
import { AppLogger } from '../observability/app-logger.js';
const QUEUE = 'ride-dispatch';
@Injectable()
export class RideDispatchWorker
  implements OnModuleInit, BeforeApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    @Inject(AppConfig) private readonly app: AppConfig,
    @Inject(RidesConfig) private readonly config: RidesConfig,
    @Inject(RidesFacade) private readonly rides: RidesFacade,
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
      this.logger.output.error('Ride dispatch queue unavailable'),
    );
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name !== 'dispatch')
          throw new Error('Unsupported ride command');
        const input = rideWorkCommand.parse(job.data);
        await this.rides.executeDispatch(input.rideId);
      },
      { connection, concurrency: 2 },
    );
    this.worker.on('error', () =>
      this.logger.output.error('Ride dispatch worker unavailable'),
    );
    this.worker.on('failed', () =>
      this.logger.output.error('Ride dispatch deferred for recovery'),
    );
    this.timer = setInterval(() => this.schedule(), 2000);
    this.timer.unref();
    this.schedule();
  }
  private schedule(): void {
    if (this.stopping || this.running) return;
    this.running = this.relay()
      .catch(() => {
        this.logger.output.error('Ride dispatch relay deferred');
      })
      .finally(() => {
        this.running = undefined;
      });
  }
  private async relay(): Promise<void> {
    for (const rideId of await this.rides.dueDispatchTasks(20)) {
      if (this.stopping) break;
      await this.queue?.add(
        'dispatch',
        { rideId, schemaVersion: 1 },
        {
          jobId: `${rideId}-${Math.floor(Date.now() / 2000)}`,
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
