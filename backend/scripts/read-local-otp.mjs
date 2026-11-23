import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

if (process.env['NODE_ENV'] === 'production')
  throw new Error('Local delivery is prohibited');
const id = process.argv[2];
if (
  !id ||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    id,
  )
)
  throw new Error('A development challenge UUID is required');
const message = JSON.parse(
  readFileSync(join(tmpdir(), 'zipp-local-otp', `${id}.json`), 'utf8'),
);
const expiresAt = Date.parse(message.expiresAt);
if (
  message.challengeId !== id ||
  typeof message.code !== 'string' ||
  !/^[0-9]{6}$/.test(message.code) ||
  !Number.isFinite(expiresAt) ||
  expiresAt <= Date.now()
)
  throw new Error('Development code is unavailable or expired');
// Only an explicit local developer invocation reveals a code; application logs never do.
console.log(message.code);
