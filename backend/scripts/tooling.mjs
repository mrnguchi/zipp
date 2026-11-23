import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'artifacts');
mkdirSync(output, { recursive: true });
const images = JSON.parse(
  readFileSync(resolve(root, 'infra/tooling/images.json'), 'utf8'),
);
for (const image of Object.values(images)) {
  if (!/@sha256:[0-9a-f]{64}$/.test(image))
    throw new Error('Tool images must be digest-pinned');
}
function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
const source = [
  '--mount',
  `type=bind,source=${root},target=/src,readonly`,
  '-w',
  '/src',
];
const reports = ['--mount', `type=bind,source=${output},target=/out`];
const command = process.argv[2];
if (command === 'secrets') {
  process.exitCode = docker([
    'run',
    '--rm',
    ...source,
    ...reports,
    images.gitleaks,
    'dir',
    '/src',
    '--config',
    '/src/.gitleaks.toml',
    '--redact',
    '--report-format',
    'json',
    '--report-path',
    '/out/secrets.json',
    '--exit-code',
    '1',
  ]);
} else if (command === 'secret-probe') {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      images.gitleaks,
      'stdin',
      '--redact',
      '--exit-code',
      '1',
    ],
    {
      input: `token = "ghp_${randomBytes(30).toString('hex').slice(0, 36)}"\n`,
      encoding: 'utf8',
    },
  );
  if (result.error || result.status !== 1)
    throw new Error(
      'Secret rejection fixture did not fail with the scanner finding code',
    );
  console.log('Synthetic secret was correctly rejected (value not logged)');
} else if (command === 'workflows') {
  const files = readdirSync(resolve(root, '.github/workflows'))
    .filter((n) => /\.ya?ml$/.test(n))
    .map((n) => `/src/.github/workflows/${n}`);
  process.exitCode = docker([
    'run',
    '--rm',
    ...source,
    images.actionlint,
    ...files,
  ]);
} else if (command === 'monitoring') {
  const args = [
    'run',
    '--rm',
    '--entrypoint=/bin/promtool',
    '--mount',
    `type=bind,source=${resolve(root, 'infra/observability')},target=/etc/prometheus,readonly`,
    images.promtool,
  ];
  if (
    docker([...args, 'check', 'config', '/etc/prometheus/prometheus.yaml']) !==
    0
  )
    throw new Error('Monitoring configuration rejected');
  process.exitCode = docker([
    ...args,
    'test',
    'rules',
    '/etc/prometheus/alerts.test.yaml',
  ]);
} else if (command === 'image' || command === 'sbom') {
  const image = process.env['ZIPP_SCAN_IMAGE'] ?? 'zipp-backend:local';
  const report = process.env['ZIPP_SCAN_REPORT'] ?? 'runtime';
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(report))
    throw new Error('Invalid report name');
  if (!/^[a-zA-Z0-9./:@_-]+$/.test(image))
    throw new Error('Invalid scan image');
  // Save the resolved local image ID: Docker archive export is not consistently
  // supported for registry digest references, while ID export preserves bytes.
  const inspected = spawnSync(
    'docker',
    ['image', 'inspect', image, '--format', '{{.Id}}'],
    { encoding: 'utf8' },
  );
  const imageId = inspected.stdout?.trim();
  if (
    inspected.error ||
    inspected.status !== 0 ||
    !/^sha256:[a-f0-9]{64}$/.test(imageId ?? '')
  )
    throw new Error('Scan image identity could not be resolved');
  if (
    docker([
      'save',
      '--output',
      resolve(output, `${report}-image.tar`),
      imageId,
    ]) !== 0
  )
    throw new Error('Image export failed');
  const args = [
    'run',
    '--rm',
    ...reports,
    '-v',
    'zipp-trivy-cache:/root/.cache/',
    images.trivy,
    'image',
    '--input',
    `/out/${report}-image.tar`,
    '--timeout',
    '10m',
    '--scanners',
    'vuln',
  ];
  if (command === 'image')
    args.push(
      '--severity',
      'HIGH,CRITICAL',
      '--exit-code',
      '1',
      '--format',
      'json',
      '--output',
      `/out/${report}-vulnerabilities.json`,
    );
  else
    args.push('--format', 'cyclonedx', '--output', `/out/${report}-sbom.json`);
  process.exitCode = docker(args);
} else
  throw new Error(
    'Expected secrets, secret-probe, workflows, monitoring, image or sbom',
  );
