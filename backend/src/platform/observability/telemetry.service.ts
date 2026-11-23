import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from '@prometheus-io/client';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import {
  TracerProvider,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AppConfig } from '../../config/environment.js';

export function httpLabels(
  method: string,
  path: string,
): { method: string; route: string } {
  // Unknown/user-provided paths and methods must not become unbounded metric labels.
  return {
    method: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ].includes(method)
      ? method
      : 'OTHER',
    route: ['/health/live', '/health/ready'].includes(path)
      ? path
      : 'unmatched',
  };
}

@Injectable()
export class TelemetryService implements OnModuleDestroy {
  readonly registry = new Registry();
  private readonly provider?: TracerProvider;
  private readonly manager?: AsyncLocalStorageContextManager;
  private readonly requests = new Histogram({
    name: 'zipp_http_duration_seconds',
    help: 'Completed HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [this.registry],
  });
  private readonly dependency = new Gauge({
    name: 'zipp_dependency_up',
    help: 'Last dependency probe status',
    labelNames: ['dependency'],
    registers: [this.registry],
  });
  private readonly dependencyTime = new Histogram({
    name: 'zipp_dependency_duration_seconds',
    help: 'Dependency probe time',
    labelNames: ['dependency'],
    registers: [this.registry],
  });
  private readonly pool = new Gauge({
    name: 'zipp_database_connections',
    help: 'PostgreSQL pool usage',
    labelNames: ['state'],
    registers: [this.registry],
  });
  private readonly jobs = new Counter({
    name: 'zipp_worker_jobs_total',
    help: 'Foundation worker results',
    labelNames: ['result'],
    registers: [this.registry],
  });
  private readonly redisState = new Gauge({
    name: 'zipp_redis_client_up',
    help: 'Redis client readiness',
    labelNames: ['role'],
    registers: [this.registry],
  });
  private readonly queueDepth = new Gauge({
    name: 'zipp_queue_jobs',
    help: 'Foundation queue depth',
    labelNames: ['state'],
    registers: [this.registry],
  });
  private readonly queueAge = new Gauge({
    name: 'zipp_queue_oldest_wait_seconds',
    help: 'Oldest queued probe age',
    registers: [this.registry],
  });
  private readonly collection = new Gauge({
    name: 'zipp_collection_success',
    help: 'Last telemetry collection status',
    labelNames: ['component'],
    registers: [this.registry],
  });

  constructor(@Inject(AppConfig) config: AppConfig) {
    this.registry.setDefaultLabels({ service: `zipp-${config.role}` });
    collectDefaultMetrics({ register: this.registry, prefix: 'zipp_' });
    if (config.traceEndpoint) {
      this.manager = new AsyncLocalStorageContextManager().enable();
      context.setGlobalContextManager(this.manager);
      this.provider = new TracerProvider({
        resource: resourceFromAttributes({
          'service.name': `zipp-${config.role}`,
          'deployment.environment.name': config.environment,
        }),
        sampler: new ParentBasedSampler({
          root: new TraceIdRatioBasedSampler(config.traceSampleRatio),
        }),
        spanProcessors: [
          new BatchSpanProcessor({
            exporter: new OTLPTraceExporter({
              url: config.traceEndpoint,
              timeoutMillis: 3000,
            }),
            maxQueueSize: 1024,
            maxExportBatchSize: 128,
            scheduledDelayMillis: 1000,
            exportTimeoutMillis: 4000,
          }),
        ],
      });
      trace.setGlobalTracerProvider(this.provider);
    }
  }

  startHttp(method: string) {
    return trace
      .getTracer('zipp-http')
      .startSpan(`HTTP ${httpLabels(method, '').method}`);
  }

  recordHttp(
    method: string,
    path: string,
    status: number,
    seconds: number,
  ): void {
    this.requests.observe(
      { ...httpLabels(method, path), status: String(status) },
      seconds,
    );
  }

  async probe(
    name: 'postgres' | 'redis',
    operation: () => Promise<void>,
  ): Promise<void> {
    const started = performance.now();
    const span = trace
      .getTracer('zipp-dependencies')
      .startSpan(`dependency.${name}`);
    try {
      await operation();
      this.dependency.set({ dependency: name }, 1);
    } catch (error) {
      this.dependency.set({ dependency: name }, 0);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      this.dependencyTime.observe(
        { dependency: name },
        (performance.now() - started) / 1000,
      );
      span.end();
    }
  }

  recordPool(stats: {
    total: number;
    idle: number;
    waiting: number;
    max: number;
  }): void {
    for (const [state, value] of Object.entries(stats))
      this.pool.set({ state }, value);
  }
  recordRedis(queueReady: boolean, cacheReady: boolean): void {
    this.redisState.set({ role: 'queue' }, Number(queueReady));
    this.redisState.set({ role: 'cache' }, Number(cacheReady));
  }
  recordJob(success: boolean): void {
    this.jobs.inc({ result: success ? 'completed' : 'failed' });
  }
  recordQueue(counts: Record<string, number>, oldestSeconds: number): void {
    for (const state of ['waiting', 'active', 'failed', 'delayed'])
      this.queueDepth.set({ state }, counts[state] ?? 0);
    this.queueAge.set(oldestSeconds);
  }
  recordCollection(component: 'queue', success: boolean): void {
    this.collection.set({ component }, Number(success));
  }

  async onModuleDestroy(): Promise<void> {
    await this.provider?.shutdown();
    if (this.provider) {
      trace.disable();
      context.disable();
      this.manager?.disable();
    }
    this.registry.clear();
  }
}
