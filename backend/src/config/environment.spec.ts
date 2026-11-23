import { describe, expect, it } from '@jest/globals';
import { parseEnvironment } from './environment.js';
import { testEnvironment } from '../../tests/helpers/test-config.js';

describe('startup configuration', () => {
  it('accepts test settings with a bounded pool', () => {
    expect(parseEnvironment(testEnvironment).databasePoolMax).toBe(5);
  });
  it.each([
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['SERVICE_ROLE', 'admin'],
    ['MANAGEMENT_ENABLED', 'yes'],
    ['MANAGEMENT_PORT', '65536'],
    ['PORT', '0'],
    ['WORKER_HEALTH_PORT', '-1'],
    ['TRACE_SAMPLE_RATIO', 'NaN'],
    ['TRACE_SAMPLE_RATIO', '-0.1'],
    ['TRACE_SAMPLE_RATIO', '1.1'],
    ['REDIS_QUEUE_URL', 'redis://:password@queue/not-a-number'],
    ['DATABASE_URL', 'postgresql://:password@database/zipp'],
    [
      'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
      'http://user:private@collector/v1/traces',
    ],
    [
      'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
      'http://collector/v1/traces?token=private',
    ],
    ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'ftp://collector/traces'],
  ])('rejects invalid %s without including its value', (key, value) => {
    expect(() =>
      parseEnvironment({ ...testEnvironment, [key]: value }),
    ).toThrow(`Invalid ${key}`);
  });
  it('accepts worker telemetry configuration and sampling boundaries', () => {
    for (const ratio of ['0', '1']) {
      const config = parseEnvironment({
        ...testEnvironment,
        SERVICE_ROLE: 'worker',
        MANAGEMENT_ENABLED: 'true',
        TRACE_SAMPLE_RATIO: ratio,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://collector:4318/v1/traces',
      });
      expect(config.role).toBe('worker');
      expect(config.traceSampleRatio).toBe(Number(ratio));
      expect(config.managementEnabled).toBe(true);
    }
  });
  it('requires verified TLS for all production connections and trace export', () => {
    const production = {
      ...testEnvironment,
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://app:test-password@db/zipp?sslmode=verify-full',
      REDIS_QUEUE_URL: 'rediss://:test-password@queue:6379',
      REDIS_CACHE_URL: 'rediss://:test-password@cache:6379',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://collector/v1/traces',
    };
    expect(parseEnvironment(production).environment).toBe('production');
    for (const [key, value] of [
      ['DATABASE_URL', 'postgresql://app:test-password@db/zipp'],
      ['REDIS_QUEUE_URL', 'redis://:test-password@queue'],
      ['REDIS_CACHE_URL', 'rediss://:local_cache_only@cache'],
      ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', 'http://collector/v1/traces'],
    ]) {
      if (!key) throw new Error('Missing fixture key');
      expect(() => parseEnvironment({ ...production, [key]: value })).toThrow(
        `Invalid ${key}`,
      );
    }
  });
  it.each(['DATABASE_URL', 'REDIS_QUEUE_URL', 'REDIS_CACHE_URL'])(
    'requires %s',
    (key) => {
      expect(() => parseEnvironment({ ...testEnvironment, [key]: '' })).toThrow(
        `Invalid ${key}`,
      );
    },
  );
  it.each(['0', '-1', '1.5', '21', 'NaN'])(
    'rejects unsafe pool size %s',
    (value) => {
      expect(() =>
        parseEnvironment({ ...testEnvironment, DB_POOL_MAX: value }),
      ).toThrow('Invalid DB_POOL_MAX');
    },
  );
  it('does not echo connection credentials in validation errors', () => {
    expect(() =>
      parseEnvironment({
        ...testEnvironment,
        DATABASE_URL: 'https://user:secret@example.com',
      }),
    ).toThrow('Invalid DATABASE_URL');
  });
  it('requires separate queue/cache services', () => {
    expect(() =>
      parseEnvironment({
        ...testEnvironment,
        REDIS_CACHE_URL: testEnvironment['REDIS_QUEUE_URL'],
      }),
    ).toThrow('must be separate');
  });
  it('rejects reuse of one Redis service under different database numbers', () => {
    expect(() =>
      parseEnvironment({
        ...testEnvironment,
        REDIS_CACHE_URL: `${testEnvironment['REDIS_QUEUE_URL']}/1`,
      }),
    ).toThrow('must be separate');
  });
  it('rejects development credentials and non-TLS production dependencies', () => {
    expect(() =>
      parseEnvironment({ ...testEnvironment, NODE_ENV: 'production' }),
    ).toThrow('Invalid DATABASE_URL');
  });
});
