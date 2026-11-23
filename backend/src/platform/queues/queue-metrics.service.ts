import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfig } from '../../config/environment.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { queueConnection } from './queue-connection.js';
import { FOUNDATION_QUEUE } from './foundation-worker.js';

@Injectable()
export class QueueMetricsService implements OnModuleDestroy {
  private readonly queue: Queue;
  private pending?: Promise<void>;
  constructor(
    @Inject(AppConfig) config: AppConfig,
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
  ) {
    this.queue = new Queue(FOUNDATION_QUEUE, {
      connection: {
        ...queueConnection(config.queueUrl),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        commandTimeout: 2000,
      },
    });
    this.queue.on('error', () =>
      this.telemetry.recordCollection('queue', false),
    );
  }
  collect(): Promise<void> {
    // Concurrent scrapes share one bounded Redis query instead of multiplying load.
    this.pending ??= this.sample().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async sample(): Promise<void> {
    try {
      const [counts, waiting] = await Promise.all([
        this.queue.getJobCounts('waiting', 'active', 'failed', 'delayed'),
        this.queue.getWaiting(0, 0),
      ]);
      this.telemetry.recordQueue(
        counts,
        waiting[0]
          ? Math.max(0, (Date.now() - waiting[0].timestamp) / 1000)
          : 0,
      );
      this.telemetry.recordCollection('queue', true);
    } catch {
      this.telemetry.recordCollection('queue', false);
    }
  }
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
