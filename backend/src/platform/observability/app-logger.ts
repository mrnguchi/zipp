import { Inject, Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { pino } from 'pino';
import type { Logger } from 'pino';
import { AppConfig } from '../../config/environment.js';
import { safeLogMessage } from './safe-log-message.js';

@Injectable()
export class AppLogger implements LoggerService {
  readonly output: Logger;

  constructor(@Inject(AppConfig) config: AppConfig) {
    this.output = pino({
      level: config.logLevel,
      base: { service: 'zipp-backend' },
      redact: [
        'password',
        'token',
        'authorization',
        'databaseUrl',
        'queueUrl',
        'cacheUrl',
      ],
    });
  }

  // Nest may pass exception objects containing connection URLs; never serialize them.
  log(message: unknown): void {
    this.output.info(safeLogMessage(message));
  }
  warn(message: unknown): void {
    this.output.warn(safeLogMessage(message));
  }
  error(): void {
    this.output.error('Framework operation failed');
  }
  debug(message: unknown): void {
    this.output.debug(safeLogMessage(message));
  }
}
