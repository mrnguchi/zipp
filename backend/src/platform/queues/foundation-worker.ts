import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { Worker } from 'bullmq';
import { AppConfig } from '../../config/environment.js';
import { AppLogger } from '../observability/app-logger.js';
import { queueConnection } from './queue-connection.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export const FOUNDATION_QUEUE = 'foundation-probes';

@Injectable()
export class FoundationWorker
  implements OnModuleInit, BeforeApplicationShutdown
{
  private worker?: Worker;

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(AppLogger) private readonly logger: AppLogger,
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
  ) {}

  async onModuleInit(): Promise<void> {
    // An infrastructure-only probe proves independent worker execution; no product jobs yet.
    this.worker = new Worker(
      FOUNDATION_QUEUE,
      (job) => {
        const span = trace.getTracer('zipp-worker').startSpan('job.foundation');
        try {
          if (job.name !== 'ping')
            throw new Error('Unsupported foundation job');
          return Promise.resolve({ status: 'processed' });
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
      { connection: queueConnection(this.config.queueUrl), concurrency: 2 },
    );
    this.worker.on('error', () =>
      this.logger.output.error('Worker connection unavailable'),
    );
    this.worker.on('completed', () => this.telemetry.recordJob(true));
    this.worker.on('failed', () => this.telemetry.recordJob(false));
    await this.worker.waitUntilReady();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
