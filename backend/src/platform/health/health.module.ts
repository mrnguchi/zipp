import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { HealthService } from './health.service.js';
import { HealthController } from './health.controller.js';
import { ManagementServer } from './management.server.js';
import { QueueMetricsService } from '../queues/queue-metrics.service.js';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService, ManagementServer, QueueMetricsService],
  exports: [HealthService],
})
export class HealthModule {}
