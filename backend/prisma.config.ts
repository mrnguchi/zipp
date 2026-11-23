import { defineConfig } from 'prisma/config';

// Validation/generation are offline. Deploy always requires an explicit migration URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env['MIGRATION_DATABASE_URL'],
  },
});
