import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import type {
  OnApplicationBootstrap,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { AppConfig } from '../../config/environment.js';
import { HealthService } from './health.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { QueueMetricsService } from '../queues/queue-metrics.service.js';

@Injectable()
export class ManagementServer
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private server?: Server;
  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(HealthService) private readonly health: HealthService,
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
    @Inject(QueueMetricsService) private readonly queues: QueueMetricsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.managementEnabled) return;
    this.server = createServer((request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405).end();
        return;
      }
      if (request.url === '/metrics') {
        response.setHeader('content-type', this.telemetry.registry.contentType);
        void this.queues
          .collect()
          .then(() => this.telemetry.registry.metrics())
          .then(
            (body) => response.end(body),
            () => response.writeHead(503).end(),
          );
        return;
      }
      response.setHeader('content-type', 'application/json');
      if (request.url === '/health/live') {
        response.end('{"status":"alive"}');
        return;
      }
      if (request.url !== '/health/ready') {
        response.writeHead(404).end();
        return;
      }
      void this.health.ready().then(
        (body) => response.end(JSON.stringify(body)),
        () => response.writeHead(503).end('{"status":"unavailable"}'),
      );
    });
    this.server.requestTimeout = 5000;
    this.server.headersTimeout = 5000;
    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(
        this.config.role === 'worker'
          ? this.config.workerHealthPort
          : this.config.managementPort,
        '0.0.0.0',
        resolve,
      );
    });
  }
  async beforeApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
