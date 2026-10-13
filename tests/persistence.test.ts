import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.js';
import { Agent } from '../server/agent.js';

test('SQLite survives restart and interrupted scans are not reported as complete', () => {
  const directory = mkdtempSync(join(tmpdir(), 'patchpilot-test-'));
  try {
    const path = join(directory, 'workspace.sqlite');
    const first = new Store(path);
    const agent = new Agent(first, { hasKey: () => false });
    const inventory = agent.createInventory('Persistent inventory', '', 'upload', {
      lockfileVersion: 3,
      packages: { 'node_modules/lodash': { version: '4.17.20' } },
    });
    agent.setMonitoring(inventory.id, true);
    first.put('scans', {
      id: 'interrupted',
      inventoryId: inventory.id,
      status: 'scanning',
      trigger: 'manual',
      createdAt: new Date().toISOString(),
      total: 1,
      scanned: 0,
      failed: 0,
      skipped: [],
      findings: [],
      errors: [],
      newFindings: 0,
      noLongerDetected: 0,
    });
    first.close();
    const second = new Store(path);
    new Agent(second, { hasKey: () => false });
    assert.equal(second.get('inventories', inventory.id)?.name, 'Persistent inventory');
    assert.equal(second.get('inventories', inventory.id)?.monitoring, true);
    assert.equal(second.get('scans', 'interrupted')?.status, 'failed');
    assert.match(second.get('scans', 'interrupted')!.errors[0], /stopped/);
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
