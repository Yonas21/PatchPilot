import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectInventoryFindings, dashboardScans } from '../shared/scan-selection.js';
import type { Finding, Scan } from '../shared/types.js';

const finding = (key: string): Finding => ({
  key,
  dependency: { name: key, version: '1.0.0', dev: false, locations: [] },
  advisory: {
    id: key,
    aliases: [],
    summary: key,
    details: '',
    severity: 'high',
    references: [],
    fixedVersions: [],
  },
});
const scan = (
  id: string,
  inventoryId: string,
  status: Scan['status'],
  findings: Finding[] = [],
): Scan => ({
  id,
  inventoryId,
  status,
  findings,
  trigger: 'manual',
  createdAt: new Date().toISOString(),
  total: 2,
  scanned: status === 'completed' ? 2 : 1,
  failed: status === 'partial' ? 1 : 0,
  skipped: [],
  errors: [],
  newFindings: 0,
  noLongerDetected: 0,
});

test('partial scans keep prior unresolved findings with explicit stale provenance', () => {
  const scans = [
    scan('new', 'one', 'partial', [finding('fresh')]),
    scan('old', 'one', 'completed', [finding('old')]),
  ];
  const rows = selectInventoryFindings(scans, 'one');
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.finding.key === 'old')?.stale, true);
  assert.equal(rows.find((row) => row.finding.key === 'old')?.scan.id, 'old');
  assert.equal(rows.find((row) => row.finding.key === 'fresh')?.stale, false);
});

test('only complete newer evidence clears earlier findings', () => {
  assert.equal(
    selectInventoryFindings(
      [scan('new', 'one', 'completed'), scan('old', 'one', 'completed', [finding('old')])],
      'one',
    ).length,
    0,
  );
  const failed = selectInventoryFindings(
    [scan('new', 'one', 'failed'), scan('old', 'one', 'completed', [finding('old')])],
    'one',
  );
  assert.equal(failed.length, 1);
  assert.equal(failed[0].stale, true);
});

test('history limits preserve latest and baseline evidence for every inventory', () => {
  const scans = [
    ...Array.from({ length: 65 }, (_, i) => scan(`busy-${i}`, 'busy', 'completed')),
    scan('quiet-partial', 'quiet', 'partial'),
    scan('quiet-complete', 'quiet', 'completed', [finding('old')]),
  ];
  const selected = dashboardScans(scans);
  assert.ok(selected.some((item) => item.id === 'quiet-partial'));
  assert.ok(selected.some((item) => item.id === 'quiet-complete'));
  assert.equal(selectInventoryFindings(selected, 'quiet').length, 1);
});
