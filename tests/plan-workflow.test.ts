import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { Agent } from '../server/agent.js';
import { createPlan, approvePlan, verifyPlan } from '../server/workbench/plans.js';
import { workbenchDemo } from '../server/workbench/demo.js';
import { parseLockfile } from '../server/inventory.js';
import { dashboardScans, selectInventoryFindings } from '../shared/scan-selection.js';
import type { Finding } from '../shared/types.js';

test('plan approval, isolated candidate scan, durable comparison, and source isolation', async () => {
  const store = new Store(':memory:');
  const agent = new Agent(store, {
    hasKey: () => false,
    scan: async (deps) => ({
      scanned: deps.length,
      failed: 0,
      errors: [],
      findings: deps
        .filter((d) => d.name === 'lodash' || d.version === '1.2.5')
        .map(
          (d) =>
            ({
              key: `${d.name}:${d.version}`,
              dependency: d,
              advisory: {
                id: `GHSA-${d.name}`,
                aliases: [],
                severity: 'high',
                summary: 'Test evidence',
                details: '',
                fixedVersions: ['1.2.8'],
                references: [],
              },
            }) as Finding,
        ),
    }),
  });
  const inventory = agent.createInventory('Lab', '', 'demo', workbenchDemo());
  const baseline = agent.startScan(inventory.id);
  await agent.idle();
  // Distinct times also make deterministic comparison independent of clock resolution.
  store.put('scans', { ...store.get('scans', baseline.id)!, createdAt: '2026-01-01T00:00:00Z' });
  const plan = createPlan(store, baseline.id);
  assert.equal(createPlan(store, baseline.id).id, plan.id);
  assert.equal(plan.steps.length, 2);
  assert.equal(
    plan.steps.every((s) => s.direct),
    true,
  );
  assert.throws(() => verifyPlan(store, plan.id, baseline.id), /Approve/);
  const approved = approvePlan(store, plan.id);
  assert.equal(approvePlan(store, plan.id).approvedAt, approved.approvedAt);
  const candidate = agent.startScan(inventory.id, 'manual', {
    parsed: parseLockfile(workbenchDemo(true)),
    planId: plan.id,
  });
  assert.throws(() => agent.startScan(inventory.id), /Wait/);
  await agent.idle();
  const result = verifyPlan(store, plan.id, candidate.id);
  assert.deepEqual(result.verifications[0].comparison.changes.map((c) => c.state).sort(), [
    'not-detected',
    'persistent',
  ]);
  assert.equal(verifyPlan(store, plan.id, candidate.id).verifications.length, 1);
  assert.equal(
    store.get('inventories', inventory.id)?.packages.find((d) => d.name === 'minimist')?.version,
    '1.2.5',
  );
  assert.equal(dashboardScans(store.list('scans')).length, 1);
  assert.equal(selectInventoryFindings(store.list('scans'), inventory.id).length, 2);
  assert.equal(
    store.get('scans', baseline.id)?.snapshot?.find((d) => d.name === 'minimist')?.version,
    '1.2.5',
  );
  store.close();
});

test('new source scans invalidate unapproved plans and historical scans require new snapshots', async () => {
  const store = new Store(':memory:');
  const agent = new Agent(store, {
    hasKey: () => false,
    scan: async (deps) => ({
      scanned: deps.length,
      failed: 0,
      errors: [],
      findings: [
        {
          key: 'f',
          dependency: deps[0],
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
    }),
  });
  const inventory = agent.createInventory('Lab', '', 'demo', workbenchDemo());
  const before = agent.startScan(inventory.id);
  await agent.idle();
  const plan = createPlan(store, before.id);
  agent.startScan(inventory.id);
  await agent.idle();
  assert.throws(() => approvePlan(store, plan.id), /evidence changed/);
  const old = store.get('scans', before.id)!;
  store.put('scans', { ...old, snapshot: undefined });
  assert.throws(() => createPlan(store, before.id), /snapshot/);
  store.close();
});
