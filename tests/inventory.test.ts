import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLockfile } from '../server/inventory.js';

test('parses nested scoped dependencies and merges runtime/dev occurrences', () => {
  const result = parseLockfile({
    lockfileVersion: 3,
    packages: {
      '': { name: 'app', version: '1.0.0' },
      'node_modules/@scope/thing': { version: '1.2.3', dev: true },
      'node_modules/a/node_modules/@scope/thing': { version: '1.2.3' },
      'node_modules/link': { link: true, resolved: 'packages/local' },
    },
  });
  assert.equal(result.packages.length, 1);
  assert.equal(result.packages[0].name, '@scope/thing');
  assert.equal(result.packages[0].dev, false);
  assert.equal(result.packages[0].locations.length, 2);
  assert.equal(result.skipped.length, 1);
});

test('rejects unsupported format, malformed versions, and excessive coverage', () => {
  assert.throws(() => parseLockfile({ lockfileVersion: 4 }), /version 1, 2 or 3/);
  assert.throws(() => parseLockfile({ lockfileVersion: 3, packages: [] }), /packages/);
  const skipped = parseLockfile({
    lockfileVersion: 3,
    packages: {
      'node_modules/a': { version: '^1.0.0' },
      'node_modules/b': { version: '1.0.0', resolved: 'git+https://example.com/b' },
    },
  });
  assert.equal(skipped.packages.length, 0);
  assert.equal(skipped.skipped.length, 2);
  const packages = Object.fromEntries(
    Array.from({ length: 2001 }, (_, i) => [`node_modules/p${i}`, { version: '1.0.0' }]),
  );
  assert.throws(() => parseLockfile({ lockfileVersion: 3, packages }), /2000/);
});

test('uses the actual package name for npm aliases', () => {
  const result = parseLockfile({
    lockfileVersion: 2,
    packages: {
      'node_modules/alias': { name: 'lodash', version: '4.17.20' },
    },
  });
  assert.equal(result.packages[0].name, 'lodash');
});

test('accepts GitHub lockfile links and preserves repository shorthand', async () => {
  const { parseRepositoryInput } = await import('../shared/repository-input.js');
  assert.deepEqual(
    parseRepositoryInput(
      'https://github.com/Yonas21/Expense_traker-app/blob/master/package-lock.json',
    ),
    { owner: 'Yonas21', repo: 'Expense_traker-app', ref: 'master', path: 'package-lock.json' },
  );
  assert.deepEqual(parseRepositoryInput(' owner/project ', 'release/v1', 'web/package-lock.json'), {
    owner: 'owner',
    repo: 'project',
    ref: 'release/v1',
    path: 'web/package-lock.json',
  });
  assert.deepEqual(parseRepositoryInput('https://github.com/owner/project/'), {
    owner: 'owner',
    repo: 'project',
    ref: 'HEAD',
    path: 'package-lock.json',
  });
  assert.deepEqual(
    parseRepositoryInput(
      'https://github.com/owner/project/blob/release%2Fv1/web/package-lock.json?raw=true#L1',
    ),
    { owner: 'owner', repo: 'project', ref: 'release/v1', path: 'web/package-lock.json' },
  );
});

test('rejects unsupported or incomplete repository URLs', async () => {
  const { parseRepositoryInput } = await import('../shared/repository-input.js');
  for (const input of [
    'https://example.com/owner/project',
    'https://github.com.evil.test/owner/project',
    'https://github.com/owner/project/blob/master',
    'https://github.com/owner/project/tree/master',
    'https://user:password@github.com/owner/project',
    'owner/project/extra',
  ])
    assert.throws(() => parseRepositoryInput(input));
});

test('parses v1 nested dependencies and inherits development scope', () => {
  const result = parseLockfile({
    lockfileVersion: 1,
    dependencies: {
      tool: { version: '1.0.0', dev: true, dependencies: { '@scope/pkg': { version: '2.0.0' } } },
      '@scope/pkg': { version: '2.0.0' },
    },
  });
  const pkg = result.packages.find((p) => p.name === '@scope/pkg')!;
  assert.equal(pkg.dev, false);
  assert.deepEqual(pkg.locations.sort(), [
    'node_modules/@scope/pkg',
    'node_modules/tool/node_modules/@scope/pkg',
  ]);
  assert.throws(() => parseLockfile({ lockfileVersion: 1, dependencies: [] }), /dependencies/);
});
