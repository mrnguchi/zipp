import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';
import { AppLogger } from './platform/observability/app-logger.js';

async function main(): Promise<void> {
  process.env['SERVICE_ROLE'] = 'worker';
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
    abortOnError: false,
  });
  app.useLogger(app.get(AppLogger));
  app.enableShutdownHooks();
}

main().catch(() => {
  process.stderr.write(
    'Worker startup failed; verify configuration and dependency health.\n',
  );
  process.exitCode = 1;
});
