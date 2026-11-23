import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { RidesModule } from '../rides/rides.module.js';
import { DeliveriesModule } from '../deliveries/deliveries.module.js';
import { RedisModule } from '../../platform/redis/redis.module.js';
import { RateLimitModule } from '../../platform/security/redis-rate-limit.js';
import { RealtimeConfig } from './realtime.config.js';
import { ConnectionLeases } from './application/connection-leases.port.js';
import { RedisConnectionLeases } from './infrastructure/redis-connection-leases.js';
import { LiveProjectionService } from './application/live-projection.service.js';
import { LiveSessionsService } from './application/live-sessions.service.js';
import { LiveServer } from './presentation/live-server.js';
@Module({
  imports: [
    IdentityModule,
    RidesModule,
    DeliveriesModule,
    RedisModule,
    RateLimitModule,
  ],
  providers: [
    { provide: RealtimeConfig, useFactory: () => new RealtimeConfig() },
    { provide: ConnectionLeases, useClass: RedisConnectionLeases },
    LiveProjectionService,
    LiveSessionsService,
    LiveServer,
  ],
})
export class RealtimeModule {}
