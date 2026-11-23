import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../../config/environment.js';
import { AppLogger } from '../observability/app-logger.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly queue: Redis;
  readonly cache: Redis;

  constructor(
    @Inject(AppConfig) config: AppConfig,
    @Inject(AppLogger) logger: AppLogger,
  ) {
    const create = (url: string): Redis => {
      const client = new Redis(url, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        commandTimeout: 2000,
        retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
      });
      client.on('error', () =>
        logger.output.warn('Redis connection unavailable'),
      );
      return client;
    };
    this.queue = create(config.queueUrl);
    this.cache = create(config.cacheUrl);
  }

  async onModuleInit(): Promise<void> {
    try {
      await Promise.all([this.queue.connect(), this.cache.connect()]);
    } catch {
      this.queue.disconnect();
      this.cache.disconnect();
      throw new Error('Redis initialization failed');
    }
  }

  async ping(): Promise<void> {
    await Promise.all([this.queue.ping(), this.cache.ping()]);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.queue.quit(), this.cache.quit()]);
    this.queue.disconnect();
    this.cache.disconnect();
  }
}
