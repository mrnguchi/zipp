export type Environment = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export class AppConfig {
  constructor(
    readonly environment: Environment,
    readonly port: number,
    readonly workerHealthPort: number,
    readonly databaseUrl: string,
    readonly databasePoolMax: number,
    readonly queueUrl: string,
    readonly cacheUrl: string,
    readonly logLevel: LogLevel,
    readonly role: 'api' | 'worker' = 'api',
    readonly managementEnabled: boolean = true,
    readonly managementPort: number = 3002,
    readonly traceEndpoint?: string,
    readonly traceSampleRatio: number = 0.1,
  ) {}
}

/** Fail with setting names only: URLs can contain credentials. */
export function parseEnvironment(env: NodeJS.ProcessEnv): AppConfig {
  const environment = env['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(environment)) {
    throw new Error('Invalid NODE_ENV');
  }
  const integer = (key: string, fallback: number, max: number): number => {
    const raw = env[key] ?? String(fallback);
    if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${key}`);
    const value = Number(raw);
    if (value < 1 || value > max) throw new Error(`Invalid ${key}`);
    return value;
  };
  const url = (key: string, protocols: string[]): string => {
    const raw = env[key];
    try {
      if (!raw) throw new Error();
      const parsed = new URL(raw);
      if (!protocols.includes(parsed.protocol) || !parsed.hostname)
        throw new Error();
      if (!parsed.password) throw new Error();
      if (
        key === 'DATABASE_URL' &&
        (!parsed.username || parsed.pathname.length < 2)
      ) {
        throw new Error();
      }
      if (
        key.startsWith('REDIS') &&
        !/^\/(?:\d+)?$/.test(parsed.pathname || '/')
      ) {
        throw new Error();
      }
      if (environment === 'production') {
        if (parsed.password.startsWith('local_')) throw new Error();
        if (key.startsWith('REDIS') && parsed.protocol !== 'rediss:')
          throw new Error();
        if (
          key === 'DATABASE_URL' &&
          parsed.searchParams.get('sslmode') !== 'verify-full'
        ) {
          throw new Error();
        }
      }
      return raw;
    } catch {
      throw new Error(`Invalid ${key}`);
    }
  };
  const logLevel = env['LOG_LEVEL'] ?? 'info';
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) {
    throw new Error('Invalid LOG_LEVEL');
  }
  const databaseUrl = url('DATABASE_URL', ['postgres:', 'postgresql:']);
  const queueUrl = url('REDIS_QUEUE_URL', ['redis:', 'rediss:']);
  const cacheUrl = url('REDIS_CACHE_URL', ['redis:', 'rediss:']);
  const queueEndpoint = new URL(queueUrl);
  const cacheEndpoint = new URL(cacheUrl);
  if (
    queueEndpoint.hostname === cacheEndpoint.hostname &&
    (queueEndpoint.port || '6379') === (cacheEndpoint.port || '6379')
  )
    throw new Error('Queue and cache Redis must be separate');
  const role = env['SERVICE_ROLE'] ?? 'api';
  if (role !== 'api' && role !== 'worker')
    throw new Error('Invalid SERVICE_ROLE');
  const enabled = env['MANAGEMENT_ENABLED'] ?? 'true';
  if (enabled !== 'true' && enabled !== 'false')
    throw new Error('Invalid MANAGEMENT_ENABLED');
  const ratio = Number(env['TRACE_SAMPLE_RATIO'] ?? '0.1');
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
    throw new Error('Invalid TRACE_SAMPLE_RATIO');
  const endpoint = env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'] || undefined;
  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      )
        throw new Error();
      if (environment === 'production' && parsed.protocol !== 'https:')
        throw new Error();
    } catch {
      throw new Error('Invalid OTEL_EXPORTER_OTLP_TRACES_ENDPOINT');
    }
  }
  return new AppConfig(
    environment as Environment,
    integer('PORT', 3000, 65535),
    integer('WORKER_HEALTH_PORT', 3001, 65535),
    databaseUrl,
    integer('DB_POOL_MAX', 5, 20),
    queueUrl,
    cacheUrl,
    logLevel as LogLevel,
    role,
    enabled === 'true',
    integer('MANAGEMENT_PORT', 3002, 65535),
    endpoint,
    ratio,
  );
}
