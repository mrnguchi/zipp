import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const profile = process.argv[2] ?? 'baseline';
if (!['baseline', 'burst'].includes(profile))
  throw new Error('Invalid load profile');
const result = spawnSync(
  'docker',
  [
    'compose',
    '-p',
    'zipp-m0-test',
    '-f',
    'infra/compose/compose.yaml',
    '-f',
    'infra/compose/compose.test.yaml',
    '-f',
    'infra/compose/compose.performance.yaml',
    'run',
    '--rm',
    '--no-deps',
    'k6',
  ],
  {
    cwd: root,
    env: { ...process.env, PROFILE: profile },
    encoding: 'utf8',
    timeout: 180000,
  },
);
const identity = spawnSync(
  'docker',
  ['image', 'inspect', 'zipp-backend:local', '--format', '{{.Id}}'],
  { encoding: 'utf8' },
);
const report = `Date: ${new Date().toISOString()}\nRuntime image: ${identity.stdout?.trim()}\nScope: isolated zipp-m0-test readiness only; working tree may be uncommitted\nProfile: ${profile}; RATE=${process.env['RATE'] ?? '20'}; DURATION=${process.env['DURATION'] ?? '30s'}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`;
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
writeFileSync(resolve(root, `artifacts/load-${profile}.txt`), report);
console.log(report);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
