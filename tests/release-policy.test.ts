import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRelease } from '../shared/release-policy.js';
import { defaultPolicy, type RiskException } from '../shared/release.js';
import type { Scan } from '../shared/types.js';
const now = new Date('2026-10-13T12:00:00Z');
const policy = { id: 'inventory', ...defaultPolicy };
const dependency = { name: 'sample', version: '1.0.0', dev: false, locations: [] };
const scan: Scan = {
  id: 'scan',
  inventoryId: 'inventory',
  createdAt: '2026-10-13T10:00:00Z',
  completedAt: '2026-10-13T10:01:00Z',
  status: 'completed',
  trigger: 'manual',
  total: 1,
  scanned: 1,
  failed: 0,
  skipped: [],
  snapshot: [dependency],
  errors: [],
  newFindings: 0,
  noLongerDetected: 0,
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
        fixedVersions: [],
        references: [],
      },
    },
  ],
};
const exception: RiskException = {
  id: 'e',
  inventoryId: 'inventory',
  findingKey: 'f',
  package: 'sample',
  version: '1.0.0',
  advisoryId: 'A',
  reason: 'Reviewed mitigation',
  owner: 'Reviewer',
  createdAt: '2026-10-13T11:00:00Z',
  expiresAt: '2026-10-14T00:00:00Z',
};
test('release exceptions are scoped, expire, revoke, and never remove findings', () => {
  assert.equal(evaluateRelease(scan, policy, [], 'scan', now).outcome, 'blocked');
  const allowed = evaluateRelease(scan, policy, [exception], 'scan', now);
  assert.equal(allowed.outcome, 'meets-policy-with-exceptions');
  assert.equal(allowed.findings.length, 1);
  for (const changed of [
    { ...exception, inventoryId: 'other' },
    { ...exception, version: '2.0.0' },
    { ...exception, revokedAt: now.toISOString() },
    { ...exception, expiresAt: now.toISOString() },
  ]) {
    assert.equal(evaluateRelease(scan, policy, [changed], 'scan', now).outcome, 'blocked');
  }
});
test('missing, partial, stale and superseded scans cannot meet release criteria', () => {
  for (const changed of [
    { ...scan, status: 'partial' as const },
    { ...scan, snapshot: undefined },
    { ...scan, completedAt: '2026-10-10T00:00:00Z' },
    { ...scan, completedAt: undefined },
  ]) {
    assert.equal(evaluateRelease(changed, policy, [exception], 'scan', now).outcome, 'blocked');
  }
  assert.equal(evaluateRelease(scan, policy, [exception], 'newer', now).outcome, 'blocked');
});
test('policy thresholds, unknown severities and development scope are explicit', () => {
  assert.equal(
    evaluateRelease(scan, { ...policy, minimumSeverity: 'critical' }, [], 'scan', now).outcome,
    'meets-policy',
  );
  const unknown = {
    ...scan,
    findings: [
      {
        ...scan.findings[0],
        advisory: { ...scan.findings[0].advisory, severity: 'unknown' as const },
      },
    ],
  };
  assert.equal(evaluateRelease(unknown, policy, [], 'scan', now).outcome, 'blocked');
  assert.equal(
    evaluateRelease(unknown, { ...policy, blockUnknown: false }, [], 'scan', now).outcome,
    'meets-policy',
  );
  const dev = {
    ...scan,
    findings: [{ ...scan.findings[0], dependency: { ...dependency, dev: true } }],
  };
  assert.equal(
    evaluateRelease(dev, { ...policy, includeDevelopment: false }, [], 'scan', now).outcome,
    'meets-policy',
  );
});
