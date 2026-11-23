import { Controller, Get, Inject } from '@nestjs/common';
import { HealthService } from './health.service.js';
import { Access } from '../../shared/http/auth-context.js';

// Explicit infrastructure exception to the API's default authentication policy.
@Controller('health')
@Access({ public: true, health: true })
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('live')
  live(): { status: 'alive' } {
    return { status: 'alive' };
  }

  @Get('ready')
  ready(): Promise<{ status: 'ready' }> {
    return this.health.ready();
  }
}
