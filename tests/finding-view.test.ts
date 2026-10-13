import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FindingDetail } from '../client/components/FindingDetail.js';
import type { Finding, Scan, Ticket } from '../shared/types.js';

test('approved tasks do not block access to the original evidence and AI brief controls', () => {
  const finding: Finding = {
    key: 'f',
    dependency: { name: 'lodash', version: '4.17.20', dev: false, locations: [] },
    advisory: {
      id: 'GHSA-example',
      aliases: [],
      summary: 'Published evidence',
      details: 'Evidence text',
      severity: 'high',
      references: [],
      fixedVersions: [],
    },
  };
  const scan: Scan = {
    id: 's',
    inventoryId: 'i',
    status: 'completed',
    trigger: 'manual',
    createdAt: '2026-10-12T12:00:00Z',
    total: 1,
    scanned: 1,
    failed: 0,
    skipped: [],
    findings: [finding],
    errors: [],
    newFindings: 1,
    noLongerDetected: 0,
  };
  const ticket: Ticket = {
    id: 't',
    inventoryId: 'i',
    scanId: 's',
    findingKey: 'f',
    title: 'Approved task',
    body: 'Task body',
    status: 'open',
    createdAt: scan.createdAt,
    updatedAt: scan.createdAt,
  };
  const html = renderToStaticMarkup(
    createElement(FindingDetail, {
      row: { finding, scan, inventoryName: 'Demo' },
      gemini: true,
      ticket,
      onClose: () => {},
      refresh: async () => {},
    }),
  );
  assert.match(html, /Published evidence/);
  assert.match(html, /Generate AI brief/);
  assert.match(html, /View saved task/);
});
