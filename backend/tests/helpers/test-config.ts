import { parseEnvironment } from '../../src/config/environment.js';

export const testEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL:
    'postgresql://zipp_app:local_app_only@127.0.0.1:55433/zipp_test',
  REDIS_QUEUE_URL: 'redis://:local_queue_only@127.0.0.1:56381',
  REDIS_CACHE_URL: 'redis://:local_cache_only@127.0.0.1:56382',
  LOG_LEVEL: 'silent',
  MANAGEMENT_ENABLED: 'false',
};
export const testConfig = parseEnvironment(testEnvironment);
