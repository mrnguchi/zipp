import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { TelemetryService, httpLabels } from './telemetry.service.js';
import { testConfig } from '../../../tests/helpers/test-config.js';
import { createServer } from 'node:http';

describe('bounded private telemetry', () => {
  it('exports sampled spans to the configured collector and drains on shutdown', async () => {
    const received: Buffer[] = [];
    const server = createServer((request, response) => {
      request.on('data', (chunk: Buffer) => received.push(chunk));
      request.on('end', () =>
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end('{}'),
      );
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Collector did not bind');
    const telemetry = new TelemetryService({
      ...testConfig,
      traceEndpoint: `http://127.0.0.1:${address.port}/v1/traces`,
      traceSampleRatio: 1,
    });
    try {
      const span = telemetry.startHttp('GET');
      span.end();
      telemetry.recordQueue({ waiting: 2 }, 31);
      telemetry.recordCollection('queue', false);
      telemetry.recordJob(false);
      await telemetry.onModuleDestroy();
      expect(Buffer.concat(received).length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('never uses user paths, query values or arbitrary methods as labels', () => {
    expect(httpLabels('SECRET', '/users/private-token')).toEqual({
      method: 'OTHER',
      route: 'unmatched',
    });
  });
  it('records metrics in an instance registry without sensitive input', async () => {
    const telemetry = new TelemetryService(testConfig);
    telemetry.recordHttp('GET', '/users/private-token', 404, 0.02);
    telemetry.recordPool({ total: 2, idle: 1, waiting: 0, max: 5 });
    telemetry.recordRedis(true, false);
    telemetry.recordJob(true);
    await telemetry.probe('postgres', () => Promise.resolve());
    const metrics = await telemetry.registry.metrics();
    expect(metrics).toContain('zipp_http_duration_seconds');
    expect(metrics).toContain('zipp_database_connections');
    expect(metrics).not.toContain('private-token');
    await telemetry.onModuleDestroy();
  });
  it('reports probe failures without exporting exception details', async () => {
    const telemetry = new TelemetryService(testConfig);
    await expect(
      telemetry.probe('redis', () =>
        Promise.reject(new Error('redis://private-password')),
      ),
    ).rejects.toThrow();
    const metrics = await telemetry.registry.metrics();
    expect(metrics).toContain('dependency="redis"');
    expect(metrics).not.toContain('private-password');
    await telemetry.onModuleDestroy();
  });
});
