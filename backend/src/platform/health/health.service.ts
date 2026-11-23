import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { BeforeApplicationShutdown } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';

@Injectable()
export class HealthService implements BeforeApplicationShutdown {
  private draining = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(TelemetryService) private readonly telemetry: TelemetryService,
  ) {}

  beforeApplicationShutdown(): void {
    this.draining = true;
  }

  async ready(): Promise<{ status: 'ready' }> {
    if (this.draining) throw new ServiceUnavailableException();
    const checks = await Promise.allSettled([
      this.telemetry.probe('postgres', () => this.database.ping()),
      this.telemetry.probe('redis', () => this.redis.ping()),
    ]);
    this.telemetry.recordPool(this.database.poolStats());
    this.telemetry.recordRedis(
      this.redis.queue.status === 'ready',
      this.redis.cache.status === 'ready',
    );
    if (checks.some((check) => check.status === 'rejected') || this.draining) {
      throw new ServiceUnavailableException();
    }
    return { status: 'ready' };
  }
}
