import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, '.env');
const text = readFileSync(
  existsSync(target) ? target : resolve(root, '.env.example'),
  'utf8',
);
if (/^MIGRATION_DATABASE_URL=/m.test(text))
  throw new Error(
    'Move MIGRATION_DATABASE_URL to .env.migrate before configuring runtime identity',
  );
const migrationTarget = resolve(root, '.env.migrate');
if (
  process.env['NODE_ENV'] === 'production' ||
  /^NODE_ENV\s*=\s*["']?production/m.test(text)
)
  throw new Error('This helper is for local development only');
const updates = new Map([
  ['AUTH_ENABLED', 'true'],
  ['AUTH_DELIVERY_MODE', 'local'],
]);
const unique = new Set();
for (const name of [
  'AUTH_SIGNING_KEY',
  'AUTH_DIGEST_KEY',
  'AUTH_ENCRYPTION_KEY',
]) {
  const previous = text.match(new RegExp(`^${name}=([a-f0-9]{64})$`, 'm'))?.[1];
  const value =
    previous && !unique.has(previous)
      ? previous
      : randomBytes(32).toString('hex');
  updates.set(name, value);
  unique.add(value);
}
const lines = text
  .split(/\r?\n/)
  .filter((line) => !updates.has(line.split('=', 1)[0] ?? ''));
writeFileSync(
  target,
  lines.join('\n').trimEnd() +
    '\n' +
    [...updates].map(([key, value]) => `${key}=${value}`).join('\n') +
    '\n',
  { mode: 0o600 },
);
if (!existsSync(migrationTarget))
  writeFileSync(
    migrationTarget,
    readFileSync(resolve(root, '.env.migrate.example'), 'utf8'),
    { mode: 0o600 },
  );
console.log(
  'Local identity keys configured in ignored backend/.env; values were not printed. No database, service or test was started.',
);
