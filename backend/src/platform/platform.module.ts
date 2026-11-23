import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { HealthModule } from './health/health.module.js';
import { TelemetryModule } from './observability/telemetry.module.js';

@Module({
  imports: [ConfigModule, TelemetryModule, ObservabilityModule, HealthModule],
  exports: [ConfigModule, TelemetryModule, ObservabilityModule, HealthModule],
})
export class PlatformModule {}
