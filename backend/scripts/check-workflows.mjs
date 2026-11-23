import { parse } from 'yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function workflowErrors(text) {
  const errors = [];
  const workflow = parse(text);
  if (!workflow || typeof workflow !== 'object') return ['Invalid workflow'];
  if (workflow.on?.pull_request_target)
    errors.push('pull_request_target is prohibited');
  if (workflow.permissions?.contents !== 'read')
    errors.push('Default contents permission must be read');
  for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
    if (job.uses) {
      if (
        !job.uses.startsWith('./.github/workflows/') &&
        !/@[0-9a-f]{40}$/.test(job.uses)
      )
        errors.push(`${name}: reusable workflow must be local or SHA-pinned`);
      continue;
    }
    if (
      !Number.isInteger(job['timeout-minutes']) ||
      job['timeout-minutes'] > 60
    )
      errors.push(`${name}: bounded timeout required`);
    if (job['continue-on-error']) errors.push(`${name}: failure gate disabled`);
    for (const step of job.steps ?? []) {
      if (
        step.uses &&
        !step.uses.startsWith('./') &&
        !/@[0-9a-f]{40}$/.test(step.uses)
      )
        errors.push(`${name}: action must be SHA-pinned`);
      if (
        step.uses?.startsWith('actions/checkout@') &&
        step.with?.['persist-credentials'] !== false
      )
        errors.push(`${name}: checkout must not retain credentials`);
      if (step['continue-on-error'])
        errors.push(`${name}: step ignores failure`);
      if (step.run?.includes('${{ github.event.'))
        errors.push(`${name}: event data interpolated into shell`);
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const folder = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../.github/workflows',
  );
  const errors = readdirSync(folder)
    .filter((n) => /\.ya?ml$/.test(n))
    .flatMap((name) =>
      workflowErrors(readFileSync(resolve(folder, name), 'utf8')).map(
        (error) => `${name}: ${error}`,
      ),
    );
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Workflow trust policy verified');
}
