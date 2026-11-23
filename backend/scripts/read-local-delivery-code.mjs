import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
if (process.env['NODE_ENV'] === 'production')
  throw new Error('Local delivery codes are prohibited in production');
const id = process.argv[2]?.toLowerCase();
if (
  !id ||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    id,
  )
)
  throw new Error('A development contact-code request UUID is required');
const message = JSON.parse(
  readFileSync(resolve(tmpdir(), 'zipp-delivery-codes', `${id}.json`), 'utf8'),
);
if (
  typeof message.code !== 'string' ||
  !/^\d{6}$/.test(message.code) ||
  !['PICKUP', 'HANDOVER', 'RETURN'].includes(message.purpose) ||
  !Number.isFinite(Date.parse(message.expiresAt)) ||
  Date.parse(message.expiresAt) <= Date.now()
)
  throw new Error('Development contact code is unavailable or expired');
// Explicit local invocation only; never called from an HTTP route or application logger.
console.log(message.code);
