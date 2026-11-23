import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateRelease(manifest, prefix) {
  if (!/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+\/backend$/.test(prefix ?? ''))
    throw new Error('Explicit expected GHCR namespace required');
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/.test(manifest.commit ?? '')
  )
    throw new Error('Invalid release identity');
  for (const [key, imagePrefix] of [
    ['runtime', prefix],
    ['migration', `${prefix}-migrate`],
  ]) {
    const value = manifest[key];
    if (
      typeof value !== 'string' ||
      !value.startsWith(`${imagePrefix}@sha256:`) ||
      !/^[a-f0-9]{64}$/.test(value.slice(imagePrefix.length + 8))
    )
      throw new Error(`Invalid immutable ${key} image`);
  }
  return {
    runtime: manifest.runtime,
    migration: manifest.migration,
    commit: manifest.commit,
  };
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const file = process.argv[2];
  if (!file) throw new Error('Release manifest path required');
  const text = readFileSync(file, 'utf8');
  if (text.length > 4096) throw new Error('Release manifest too large');
  const result = validateRelease(
    JSON.parse(text),
    process.env['EXPECTED_IMAGE_PREFIX'],
  );
  console.log(JSON.stringify(result));
}
