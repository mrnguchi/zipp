import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('Telemetry HTTP check failed');
  return response.json();
}
// Generate only infrastructure requests against the isolated local test API.
for (let count = 0; count < 50; count++) {
  const response = await fetch('http://127.0.0.1:3100/health/ready', {
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('Test API is not ready');
}
let targets;
for (let attempt = 0; attempt < 20; attempt++) {
  const result = await json(
    'http://127.0.0.1:9090/api/v1/query?query=' +
      encodeURIComponent('up{job=~"zipp-.*"}'),
  );
  targets = result.data?.result;
  if (targets?.length === 2 && targets.every((item) => item.value?.[1] === '1'))
    break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (targets?.length !== 2 || targets.some((item) => item.value?.[1] !== '1'))
  throw new Error('Both private metrics targets must be up');
const dependencies = await json(
  'http://127.0.0.1:9090/api/v1/query?query=zipp_dependency_up',
);
if (
  dependencies.data?.result?.length !== 4 ||
  dependencies.data.result.some((item) => item.value?.[1] !== '1')
)
  throw new Error('Dependency probes must be healthy for both process roles');
const dashboard = await json(
  'http://127.0.0.1:3300/api/dashboards/uid/zipp-foundation',
);
if (
  dashboard.dashboard?.uid !== 'zipp-foundation' ||
  dashboard.dashboard.panels?.length !== 10
)
  throw new Error('Provisioned dashboard is missing');
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
writeFileSync(
  resolve(root, 'artifacts/telemetry.json'),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      targets,
      dependencies: dependencies.data.result,
      dashboardUid: dashboard.dashboard.uid,
      panels: dashboard.dashboard.panels.length,
    },
    null,
    2,
  ),
);
console.log(
  'Both private metric targets, four dependency probes and the provisioned dashboard passed',
);
