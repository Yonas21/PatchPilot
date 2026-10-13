import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { VersionChecker } from '../server/release/version-checks.js';
import { grantException, recordDecision, exportDecision } from '../server/release/service.js';
import type { Scan } from '../shared/types.js';

function seed(store: Store) {
  store.put('plans', {
    id: 'plan',
    inventoryId: 'i',
    baselineId: 's',
    title: 'Test',
    createdAt: new Date().toISOString(),
    snapshot: [],
    findings: [],
    limitations: [],
    verifications: [],
    steps: [
      {
        id: 'sample@1.0.0',
        package: 'sample',
        version: '1.0.0',
        severity: 'high',
        runtime: true,
        findingKeys: ['f'],
        evidenceIds: ['A'],
        candidateVersions: ['2.0.0'],
        direct: true,
        paths: [],
        action: 'Review',
      },
    ],
  });
}
test('version checks verify publication, persist matches, and reject invented candidates', async () => {
  const store = new Store(':memory:');
  seed(store);
  const checker = new VersionChecker(store, {
    fetch: async () => ({ name: 'sample', version: '2.0.0' }),
    scan: async () => ({ scanned: 1, failed: 0, errors: [], findings: [] }),
  });
  await assert.rejects(checker.check('plan', 'sample@1.0.0', '999.0.0'), /candidate version/);
  const result = await checker.check('plan', 'sample@1.0.0', '2.0.0');
  assert.equal(result.published, true);
  assert.equal(result.status, 'no-matches');
  assert.equal(store.list('versionChecks').length, 1);
  store.close();
});
test('registry mismatches and partial provider results never become clean candidate checks', async () => {
  const store = new Store(':memory:');
  seed(store);
  const wrong = new VersionChecker(store, {
    fetch: async () => ({ name: 'another-package', version: '2.0.0' }),
    scan: async () => {
      throw Error('must not run');
    },
  });
  assert.equal((await wrong.check('plan', 'sample@1.0.0', '2.0.0')).status, 'unavailable');
  const failed = new VersionChecker(store, {
    fetch: async () => ({ name: 'sample', version: '2.0.0' }),
    scan: async () => ({ scanned: 0, failed: 1, errors: ['Service failure'], findings: [] }),
  });
  const result = await failed.check('plan', 'sample@1.0.0', '2.0.0');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.published, true);
  store.close();
});
test('identical concurrent version checks share one provider request', async () => {
  const store = new Store(':memory:');
  seed(store);
  let calls = 0;
  let release!: () => void;
  const wait = new Promise<void>((r) => {
    release = r;
  });
  const checker = new VersionChecker(store, {
    fetch: async () => {
      calls++;
      await wait;
      return { name: 'sample', version: '2.0.0' };
    },
    scan: async () => ({ scanned: 1, failed: 0, errors: [], findings: [] }),
  });
  const first = checker.check('plan', 'sample@1.0.0', '2.0.0'),
    second = checker.check('plan', 'sample@1.0.0', '2.0.0');
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a.id, b.id);
  store.close();
});
test('approved exceptions change policy outcomes while recorded decisions preserve their original evidence', () => {
  const store = new Store(':memory:');
  const now = new Date();
  const dependency = { name: 'sample', version: '1.0.0', dev: false, locations: [] };
  const scan: Scan = {
    id: 's',
    inventoryId: 'i',
    status: 'completed',
    trigger: 'manual',
    createdAt: now.toISOString(),
    completedAt: now.toISOString(),
    total: 1,
    scanned: 1,
    failed: 0,
    skipped: [],
    errors: [],
    newFindings: 0,
    noLongerDetected: 0,
    snapshot: [dependency],
    findings: [
      {
        key: 'f',
        dependency,
        advisory: {
          id: 'A',
          aliases: [],
          severity: 'high',
          summary: '',
          details: '',
          references: [],
          fixedVersions: [],
        },
      },
    ],
  };
  store.put('scans', scan);
  assert.equal(recordDecision(store, 's').outcome, 'blocked');
  const input = {
    scanId: 's',
    findingKey: 'f',
    owner: 'Reviewer',
    reason: 'Temporary mitigation reviewed for this demonstration.',
    expiresAt: new Date(now.getTime() + 86400000).toISOString(),
    approved: true as const,
  };
  assert.throws(
    () => grantException(store, { ...input, expiresAt: now.toISOString() }, now),
    /future/,
  );
  const exception = grantException(store, input, now);
  assert.throws(() => grantException(store, input, now), /already exists/);
  const accepted = recordDecision(store, 's');
  assert.equal(accepted.outcome, 'meets-policy-with-exceptions');
  store.put('exceptions', { ...exception, revokedAt: new Date().toISOString() });
  assert.equal(recordDecision(store, 's').outcome, 'blocked');
  assert.equal(store.get('decisions', accepted.id)?.exceptions[0].revokedAt, undefined);
  assert.match(exportDecision(accepted), /historical policy evaluation/);
  assert.match(exportDecision(accepted), /Temporary mitigation/);
  store.close();
});
