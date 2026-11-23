import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(resolve(tmpdir(), 'zipp-gates-'));
function rejects(args, marker, expectedStatus = 1) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
  });
  if (
    result.error ||
    result.status !== expectedStatus ||
    !`${result.stdout}${result.stderr}`.includes(marker)
  )
    throw new Error(`Expected rejection was not observed: ${marker}`);
}
try {
  writeFileSync(
    resolve(directory, 'broken.ts'),
    'const value: string = 42; export { value };',
  );
  writeFileSync(
    resolve(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        types: [],
        skipLibCheck: true,
      },
      files: ['broken.ts'],
    }),
  );
  rejects(
    [
      resolve(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      resolve(directory, 'tsconfig.json'),
    ],
    'TS2322',
    2,
  );
  writeFileSync(
    resolve(directory, 'broken.test.mjs'),
    "import {test} from 'node:test'; import assert from 'node:assert/strict'; test('deliberate gate failure',()=>assert.equal(1,2));",
  );
  rejects(['--test', resolve(directory, 'broken.test.mjs')], 'ERR_ASSERTION');
  console.log('Broken type and failing test were correctly rejected');
} finally {
  // Only the unique temporary directory created by this process is removed.
  rmSync(directory, { recursive: true, force: true });
}
