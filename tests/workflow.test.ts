import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { Agent } from '../server/agent.js';
import { approveTicket } from '../server/tickets.js';

test('an import rejected at scan capacity does not leave an inventory behind', async () => {
  const store = new Store(':memory:');
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const agent = new Agent(store, {
    scan: async () => {
      await wait;
      return { findings: [], scanned: 1, failed: 0, errors: [] };
    },
    hasKey: () => false,
  });
  const lock = { lockfileVersion: 3, packages: { 'node_modules/a': { version: '1.0.0' } } };
  agent.createAndScan('One', '', 'upload', lock);
  agent.createAndScan('Two', '', 'upload', lock);
  assert.throws(() => agent.createAndScan('Three', '', 'upload', lock), /Two scans/);
  assert.equal(store.list('inventories').length, 2);
  release();
  await agent.idle();
  store.close();
});

test('approved tasks are durable and deduplicated, with validated status changes', () => {
  const store = new Store(':memory:');
  const input = {
    inventoryId: 'i',
    scanId: 's',
    findingKey: 'f',
    title: 'Review lodash',
    body: 'Evidence and next steps.',
  };
  const first = approveTicket(store, input);
  const second = approveTicket(store, { ...input, title: 'Another click' });
  assert.equal(first.id, second.id);
  assert.equal(store.list('tickets').length, 1);
  assert.equal(store.get('tickets', first.id)?.title, 'Review lodash');
  store.close();
});

test('scheduled checks persist next run, avoid overlap, and preserve failure coverage', async () => {
  const store = new Store(':memory:');
  let calls = 0;
  const agent = new Agent(store, {
    scan: async () => {
      calls++;
      return { findings: [], scanned: 0, failed: 1, errors: ['provider failure'] };
    },
    hasKey: () => false,
  });
  const inventory = agent.createInventory('Example', '', 'upload', {
    lockfileVersion: 3,
    packages: { 'node_modules/a': { version: '1.0.0' } },
  });
  store.put('inventories', {
    ...inventory,
    monitoring: true,
    nextRunAt: new Date(0).toISOString(),
  });
  await agent.runDue();
  await agent.runDue();
  await agent.idle();
  assert.equal(calls, 1);
  assert.equal(store.list('scans')[0].status, 'failed');
  assert.ok(Date.parse(store.get('inventories', inventory.id)!.nextRunAt!) > Date.now());
  store.close();
});

test('scan completion persists findings and tracks new evidence without claiming fixes on partial scans', async () => {
  const store = new Store(':memory:');
  const agent = new Agent(store, {
    scan: async () => ({ findings: [], scanned: 1, failed: 0, errors: [] }),
    hasKey: () => false,
  });
  const inventory = agent.createInventory('Example', '', 'upload', {
    lockfileVersion: 3,
    packages: { 'node_modules/a': { version: '1.0.0' } },
  });
  const first = agent.startScan(inventory.id);
  assert.equal(agent.startScan(inventory.id).id, first.id);
  await agent.idle();
  assert.equal(store.get('scans', first.id)?.status, 'completed');
  store.close();
});
