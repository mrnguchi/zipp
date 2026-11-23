import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease } from './deployment.mjs';

const prefix = 'ghcr.io/mrnguchi/zipp/backend';
const manifest = {
  schemaVersion: 1,
  commit: 'a'.repeat(40),
  runtime: `${prefix}@sha256:${'b'.repeat(64)}`,
  migration: `${prefix}-migrate@sha256:${'c'.repeat(64)}`,
};
test('staging accepts only explicit digest identities in the allowed namespace', () => {
  assert.equal(validateRelease(manifest, prefix).commit, manifest.commit);
});
test('staging rejects mutable tags', () => {
  assert.throws(() =>
    validateRelease({ ...manifest, runtime: `${prefix}:latest` }, prefix),
  );
});
test('staging rejects foreign image namespaces and missing configuration', () => {
  assert.throws(() =>
    validateRelease(
      {
        ...manifest,
        migration: `ghcr.io/other/repo/backend-migrate@sha256:${'c'.repeat(64)}`,
      },
      prefix,
    ),
  );
  assert.throws(() => validateRelease(manifest));
});
