import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, BeforeApplicationShutdown } from '@nestjs/common';
import { CallingFacade } from '../../modules/calling/calling.facade.js';
import { CallingConfig } from '../../modules/calling/calling.config.js';
import { AppLogger } from '../observability/app-logger.js';
@Injectable()
export class CallReaperWorker
  implements OnModuleInit, BeforeApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    @Inject(CallingFacade) private readonly calls: CallingFacade,
    @Inject(CallingConfig) private readonly config: CallingConfig,
    @Inject(AppLogger) private readonly logger: AppLogger,
  ) {}
  onModuleInit() {
    if (!this.config.reaperEnabled) return;
    this.timer = setInterval(() => this.schedule(), 2000);
    this.timer.unref();
    this.schedule();
  }
  private schedule() {
    if (this.stopping || this.running) return;
    this.running = this.calls
      .reap(() => this.stopping)
      .catch(() => this.logger.output.error('Call cleanup deferred'))
      .finally(() => {
        this.running = undefined;
      });
  }
  async beforeApplicationShutdown() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }
}
