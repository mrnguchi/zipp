import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { AppConfig } from '../../config/environment.js';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;
  private readonly pool: Pool;
  private readonly max: number;

  constructor(@Inject(AppConfig) config: AppConfig) {
    this.max = config.databasePoolMax;
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 10000,
      statement_timeout: 2000,
      application_name: 'zipp-foundation',
    });
    this.pool.on('error', () => {
      /* Dependency probes report outages without exposing connection details. */
    });
    this.client = new PrismaClient({
      adapter: new PrismaPg(this.pool, { disposeExternalPool: true }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  async ping(): Promise<void> {
    // Readiness checks the applied schema, not merely whether a TCP port is open.
    await this.client.platformMetadata.findUniqueOrThrow({
      where: { key: 'foundation', value: 'm6' },
    });
  }
  poolStats(): { total: number; idle: number; waiting: number; max: number } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      max: this.max,
    };
  }
}
