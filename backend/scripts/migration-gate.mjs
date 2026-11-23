import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const compose = [
  'compose',
  '-p',
  'zipp-m0-test',
  '-f',
  'infra/compose/compose.yaml',
  '-f',
  'infra/compose/compose.test.yaml',
];
const database = `zipp_m1_probe_${randomBytes(8).toString('hex')}`;
if (!/^zipp_m1_probe_[a-f0-9]{16}$/.test(database))
  throw new Error('Unsafe probe database');
function run(args) {
  const result = spawnSync('docker', [...compose, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120000,
  });
  if (result.error) throw result.error;
  return result;
}
function sql(statement) {
  const result = run([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'zipp_owner',
    '-d',
    'zipp_test',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    statement,
  ]);
  if (result.status !== 0)
    throw new Error('Probe database administration failed');
}
sql(`CREATE DATABASE ${database}`);
try {
  const args = [
    'run',
    '--rm',
    '--no-deps',
    '-v',
    `${resolve(root, 'backend/tests/fixtures/failed-migration')}:/app/failuretest:ro`,
    '-e',
    `MIGRATION_DATABASE_URL=postgresql://zipp_owner:local_owner_only@postgres:5432/${database}`,
    'migrate',
    'node',
    'node_modules/prisma/build/index.js',
    'migrate',
    'deploy',
    '--config',
    'failuretest/prisma.config.ts',
  ];
  for (const marker of ['P3018', 'P3009']) {
    const result = run(args);
    if (
      result.status !== 1 ||
      !`${result.stdout}${result.stderr}`.includes(marker)
    )
      throw new Error(`Migration rejection gate did not report ${marker}`);
  }
  console.log('Invalid migration and retry of failed history were rejected');
} finally {
  // This name was generated and created above; no configured application DB is reset.
  sql(`DROP DATABASE ${database} WITH (FORCE)`);
}
