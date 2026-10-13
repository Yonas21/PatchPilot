import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLockfile } from '../server/inventory.js';
import { buildPlanSteps } from '../shared/plan-builder.js';
import { compareScans } from '../shared/scan-comparison.js';
import type { Finding, Scan } from '../shared/types.js';

function finding(version: string, id = 'GHSA-test', aliases: string[] = []): Finding {
  return {
    key: `${version}:${id}`,
    dependency: { name: 'leaf', version, dev: false, locations: ['node_modules/leaf'] },
    advisory: {
      id,
      aliases,
      severity: 'high',
      summary: 'Test',
      details: '',
      references: [],
      fixedVersions: ['2.0.0'],
    },
  };
}
function scan(id: string, findings: Finding[]): Scan {
  return {
    id,
    inventoryId: 'i',
    status: 'completed',
    trigger: 'manual',
    createdAt: `2026-10-${id === 'before' ? '12' : '13'}T00:00:00Z`,
    total: 1,
    scanned: 1,
    failed: 0,
    skipped: [],
    findings,
    errors: [],
    newFindings: 0,
    noLongerDetected: 0,
    snapshot: [
      {
        name: 'leaf',
        version: id === 'before' ? '1.0.0' : '2.0.0',
        dev: false,
        locations: ['node_modules/leaf'],
      },
    ],
  };
}
test('dependency paths follow hoisted resolution, not physical nesting', () => {
  const parsed = parseLockfile({
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { parent: '1.0.0' } },
      'node_modules/parent': { version: '1.0.0', dependencies: { leaf: '1.0.0' } },
      'node_modules/leaf': { version: '1.0.0' },
    },
  });
  const base = { ...scan('before', [finding('1.0.0')]), graph: parsed.graph };
  const [step] = buildPlanSteps(base);
  assert.equal(step.direct, false);
  assert.deepEqual(step.paths, [['node_modules/parent', 'node_modules/leaf']]);
});
test('legacy top-level placement does not claim a direct dependency', () => {
  const parsed = parseLockfile({
    lockfileVersion: 1,
    dependencies: { leaf: { version: '1.0.0' } },
  });
  assert.equal(parsed.graph?.rootDeclarations, false);
  assert.equal(
    buildPlanSteps({ ...scan('before', [finding('1.0.0')]), graph: parsed.graph })[0].direct,
    false,
  );
});
test('comparison tracks persistent aliases across version changes and introduced findings', () => {
  const result = compareScans(
    scan('before', [finding('1.0.0')]),
    scan('after', [finding('2.0.0', 'CVE-test', ['GHSA-test']), finding('2.0.0', 'GHSA-new')]),
  );
  assert.equal(result.complete, true);
  assert.deepEqual(result.changes.map((c) => c.state).sort(), ['new', 'persistent']);
  assert.equal(result.packages.changed.length, 1);
});
test('partial coverage cannot verify disappearance; older and mismatched scans are rejected', () => {
  const before = scan('before', [finding('1.0.0')]);
  const after = scan('after', []);
  assert.equal(compareScans(before, after).changes[0].state, 'not-detected');
  assert.equal(
    compareScans(before, { ...after, status: 'partial', failed: 1 }).changes[0].state,
    'inconclusive',
  );
  assert.equal(compareScans({ ...before, snapshot: undefined }, after).complete, false);
  assert.throws(() => compareScans(before, { ...after, inventoryId: 'other' }), /same inventory/);
  assert.throws(() => compareScans(after, before), /newer/);
});

test('peer dependency edges resolve from the parent installation scope', () => {
  const parsed = parseLockfile({
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { plugin: '1.0.0' } },
      'node_modules/plugin': { version: '1.0.0', peerDependencies: { leaf: '1.0.0' } },
      'node_modules/leaf': { version: '1.0.0' },
      'node_modules/plugin/node_modules/leaf': { version: '2.0.0' },
    },
  });
  assert.deepEqual(parsed.graph?.edges['node_modules/plugin'], ['node_modules/leaf']);
  assert.deepEqual(
    buildPlanSteps({ ...scan('before', [finding('1.0.0')]), graph: parsed.graph })[0].paths,
    [['node_modules/plugin', 'node_modules/leaf']],
  );
});

test('impact attributes shared and cyclic dependencies to all roots without double counting', async () => {
  const { analyzeUpgradeImpact } = await import('../shared/upgrade-impact.js');
  const roots = ['a', 'b', 'c', 'd'];
  const base = scan('before', [finding('1.0.0'), finding('1.0.0', 'GHSA-second')]);
  base.graph = {
    roots,
    rootDeclarations: true,
    unresolved: 1,
    edges: Object.fromEntries([
      ...roots.map((root) => [root, ['node_modules/leaf']]),
      ['node_modules/leaf', ['a']],
    ]),
  };
  const report = analyzeUpgradeImpact(base);
  assert.equal(report.owners.length, 4);
  assert.equal(report.totalFindings, 2);
  assert.ok(report.owners.every((o) => o.findingKeys.length === 2 && o.sharedFindingCount === 2));
  assert.equal(new Set(report.owners.flatMap((o) => o.findingKeys)).size, 2);
  assert.equal(report.unresolvedEdges, 1);
  assert.deepEqual(report.unownedFindingKeys, []);
});

test('impact does not invent owners for absent graph or disconnected findings', async () => {
  const { analyzeUpgradeImpact } = await import('../shared/upgrade-impact.js');
  const base = scan('before', [finding('1.0.0')]);
  assert.equal(analyzeUpgradeImpact(base).unownedFindingKeys.length, 1);
  const report = analyzeUpgradeImpact({
    ...base,
    graph: { roots: ['unrelated'], rootDeclarations: true, unresolved: 0, edges: {} },
  });
  assert.equal(report.owners.length, 0);
  assert.equal(report.unownedFindingKeys.length, 1);
});

test('evaluation suite executes production guards with positive and negative controls', async () => {
  const { runEvaluations } = await import('../server/workbench/evaluations.js');
  const report = runEvaluations();
  assert.equal(report.total, 11);
  assert.equal(
    report.passed,
    report.total,
    JSON.stringify(report.results.filter((r) => !r.passed)),
  );
  assert.equal(new Set(report.results.map((r) => r.id)).size, report.total);
  assert.ok(report.results.some((r) => r.actual === 'accepted'));
  assert.ok(report.results.some((r) => r.actual === 'rejected'));
});
