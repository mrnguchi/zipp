import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npm = process.env['npm_execpath'];
if (!npm) throw new Error('Run through npm run security:audit');
const result = spawnSync(process.execPath, [npm, 'audit', '--json'], {
  cwd: resolve(root, 'backend'),
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
if (result.error) throw result.error;
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  throw new Error('Dependency audit failed to return a valid report');
}
if (report.error || !report.metadata || !report.vulnerabilities)
  throw new Error('Dependency audit unavailable');
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
writeFileSync(
  resolve(root, 'artifacts/npm-audit.json'),
  JSON.stringify(report, null, 2),
);
const blocked = Object.values(report.vulnerabilities).filter((v) =>
  ['high', 'critical'].includes(v.severity),
);
console.log('Dependency audit:', report.metadata.vulnerabilities);
if (blocked.length) {
  console.error(
    'High/critical dependency findings block release:',
    blocked.map((v) => v.name).join(', '),
  );
  process.exitCode = 1;
} else
  console.log(
    'No high/critical dependency findings; low/moderate findings remain visible in the report for review.',
  );
