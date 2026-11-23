import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/environment.js';
import { configureHttp } from './bootstrap.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function main(): Promise<void> {
  process.env['SERVICE_ROLE'] = 'api';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    configureHttp(app);
    await app.listen(app.get(AppConfig).port, '0.0.0.0');
  } catch (error) {
    await app.close();
    throw error;
  }
}

main().catch(() => {
  process.stderr.write(
    'API startup failed; verify configuration and dependency health.\n',
  );
  process.exitCode = 1;
});
