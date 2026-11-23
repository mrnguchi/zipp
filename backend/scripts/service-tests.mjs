import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function docker(args) {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Build shared targets serially, avoiding duplicate API/worker builds and peak RAM.
for (const [target, tag] of [
  ['test', 'local-test'],
  ['migration', 'local-migrate'],
  ['runtime', 'local'],
])
  docker([
    'build',
    '--target',
    target,
    '--tag',
    `zipp-backend:${tag}`,
    'backend',
  ]);
docker([
  'compose',
  '-p',
  'zipp-m0-test',
  '-f',
  'infra/compose/compose.yaml',
  '-f',
  'infra/compose/compose.test.yaml',
  'run',
  '--rm',
  'test',
]);
