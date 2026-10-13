import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Store } from '../server/store.js';
import { Agent } from '../server/agent.js';
import { createApi, apiError } from '../server/api.js';
import type { Finding } from '../shared/types.js';

test('local API requires session and approval, rejects foreign origins, and exports deduplicated tasks', async () => {
  const store = new Store(':memory:');
  const finding: Finding = {
    key: 'known-finding',
    dependency: { name: 'lodash', version: '4.17.20', dev: false, locations: [] },
    advisory: {
      id: 'GHSA-test',
      aliases: [],
      summary: 'Test evidence',
      details: '',
      severity: 'high',
      references: [],
      fixedVersions: [],
    },
  };
  const agent = new Agent(store, {
    hasKey: () => false,
    scan: async () => ({ findings: [finding], scanned: 6, failed: 0, errors: [] }),
  });
  const app = express();
  app.use(
    '/api',
    express.json(),
    createApi(store, agent, new Set(['http://localhost:4310'])),
    apiError,
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try {
    const untrusted = await fetch(`${base}/session`, {
      headers: { Origin: 'https://example.com' },
    });
    assert.equal(untrusted.status, 403);
    const noSession = await fetch(`${base}/inventories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(noSession.status, 403);
    const { session } = await fetch(`${base}/session`).then((response) => response.json());
    const headers = { 'Content-Type': 'application/json', 'X-PatchPilot-Session': session };
    const created = await fetch(`${base}/inventories`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'API test', source: 'demo' }),
    });
    assert.equal(created.status, 201);
    const { scan } = await created.json();
    await agent.idle();
    const planResponse = await fetch(`${base}/workbench/plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ scanId: scan.id }),
    });
    assert.equal(planResponse.status, 201);
    const plan = await planResponse.json();
    const summary = await fetch(`${base}/workbench`).then((r) => r.json());
    assert.equal(summary.plans[0].findingCount, 1);
    assert.equal('snapshot' in summary.plans[0], false);
    assert.equal(summary.scans[0].hasSnapshot, true);
    assert.equal('findings' in summary.scans[0], false);
    const premature = await fetch(`${base}/workbench/plans/${plan.id}/candidate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ lockfile: {} }),
    });
    assert.equal(premature.status, 400);
    const noApproval = await fetch(`${base}/workbench/plans/${plan.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ approved: false }),
    });
    assert.equal(noApproval.status, 400);
    const approval = await fetch(`${base}/workbench/plans/${plan.id}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ approved: true }),
    });
    assert.equal(approval.status, 200);
    const planExport = await fetch(`${base}/workbench/plans/${plan.id}/export`);
    assert.match(await planExport.text(), /Package changes/);
    const input = {
      scanId: scan.id,
      findingKey: finding.key,
      title: 'Review test evidence',
      body: 'Investigate and verify the dependency.',
      approved: true,
    };
    const unapproved = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, approved: false }),
    });
    assert.equal(unapproved.status, 400);
    const missing = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, findingKey: 'not-in-scan' }),
    });
    assert.equal(missing.status, 404);
    const first = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    }).then((response) => response.json());
    const duplicate = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    }).then((response) => response.json());
    assert.equal(first.id, duplicate.id);
    const exported = await fetch(`${base}/tickets/${first.id}/export`);
    assert.match(exported.headers.get('content-disposition')!, /attachment/);
    assert.match(await exported.text(), /^# Review test evidence/);
    const invalidStatus = await fetch(`${base}/tickets/${first.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'invented' }),
    });
    assert.equal(invalidStatus.status, 400);
    for (let i = 0; i < 85; i++) store.event('scan', `History ${i}`, 'Pagination coverage');
    const dashboard = await fetch(`${base}/dashboard`).then((response) => response.json());
    assert.equal(dashboard.activity.length, store.list('activity').length);
    assert.ok(dashboard.activity.some((event: { title: string }) => event.title === 'History 0'));
    assert.equal(dashboard.activity[0].title, 'History 84');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
  }
});
