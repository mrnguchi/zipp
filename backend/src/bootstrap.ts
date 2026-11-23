import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppLogger } from './platform/observability/app-logger.js';
import { HttpErrorFilter } from './shared/errors/http-error.filter.js';
import {
  TelemetryService,
  httpLabels,
} from './platform/observability/telemetry.service.js';
import {
  context,
  trace,
  isSpanContextValid,
  SpanStatusCode,
} from '@opentelemetry/api';

export function configureHttp(app: NestExpressApplication): void {
  const logger = app.get(AppLogger);
  const telemetry = app.get(TelemetryService);
  app.useLogger(logger);
  app.use(helmet());
  app.set('trust proxy', false);
  const server: Server = app.getHttpServer();
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5000;
  app.use((request: Request, response: Response, next: NextFunction) => {
    // Generate locally instead of allowing untrusted correlation IDs into log records.
    const requestId = randomUUID();
    response.locals['requestId'] = requestId;
    response.setHeader('x-request-id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    const started = performance.now();
    const span = telemetry.startHttp(request.method);
    response.on('finish', () => {
      telemetry.recordHttp(
        request.method,
        request.path,
        response.statusCode,
        (performance.now() - started) / 1000,
      );
      span.setAttributes({
        'http.request.method': httpLabels(request.method, '').method,
        'http.route': httpLabels('', request.path).route,
        'http.response.status_code': response.statusCode,
      });
      if (response.statusCode >= 500)
        span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      // Intentionally exclude raw URL/query/body/headers: they can contain tokens or PII.
      logger.output.info(
        {
          requestId,
          method: request.method,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - started),
          ...(isSpanContextValid(span.spanContext())
            ? {
                traceId: span.spanContext().traceId,
                spanId: span.spanContext().spanId,
              }
            : {}),
        },
        'HTTP completed',
      );
    });
    context.with(trace.setSpan(context.active(), span), next);
  });
  app.useBodyParser('json', { limit: '16kb' });
  app.useBodyParser('urlencoded', { limit: '16kb', extended: false });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health/{*path}', method: RequestMethod.ALL }],
  });
  app.useGlobalFilters(new HttpErrorFilter(logger));
  app.enableShutdownHooks();
}
