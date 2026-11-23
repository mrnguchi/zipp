import { Global, Module } from '@nestjs/common';
import { AppConfig, parseEnvironment } from './environment.js';

@Global()
@Module({
  providers: [
    { provide: AppConfig, useFactory: () => parseEnvironment(process.env) },
  ],
  exports: [AppConfig],
})
export class ConfigModule {}
