import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundaryErrors } from './check-boundaries.mjs';
import { workflowErrors } from './check-workflows.mjs';

test('boundary gate rejects database imports in domain code', () => {
  assert.ok(
    boundaryErrors({
      'src/modules/trips/domain/trip.ts':
        "import { PrismaClient } from '@prisma/client';",
    }).length,
  );
});
test('boundary gate rejects cross-module internals and dependency cycles', () => {
  assert.ok(
    boundaryErrors({
      'src/modules/trips/application/book.ts':
        "import x from '../../wallet/infrastructure/repository.js';",
    }).length,
  );
  assert.ok(
    boundaryErrors({
      'src/modules/a/a.module.ts': "import x from '../b/b.module.js';",
      'src/modules/b/b.module.ts': "import x from '../a/a.module.js';",
    }).some((e) => e.includes('cycle')),
  );
});
test('boundary gate accepts public facade dependency', () => {
  assert.deepEqual(
    boundaryErrors({
      'src/modules/trips/application/book.ts':
        "import x from '../../wallet/wallet.facade.js';",
    }),
    [],
  );
});
test('workflow gate rejects mutable actions and unbounded jobs', () => {
  assert.ok(
    workflowErrors(
      'permissions: { contents: read }\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@main\n',
    ).length >= 2,
  );
});
test('workflow gate rejects persisted checkout credentials', () => {
  assert.ok(
    workflowErrors(
      `permissions: { contents: read }\njobs:\n  test:\n    timeout-minutes: 10\n    steps:\n      - uses: actions/checkout@${'a'.repeat(40)}\n`,
    ).some((e) => e.includes('credentials')),
  );
});
