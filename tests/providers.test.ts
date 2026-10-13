import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdvisories, scanDependencies } from '../server/providers/osv.js';
import { validateBrief } from '../server/providers/gemini.js';

const dependency = {
  name: 'lodash',
  version: '4.17.20',
  dev: false,
  locations: ['node_modules/lodash'],
};
const advisory = {
  id: 'GHSA-test',
  aliases: ['CVE-2020-1'],
  summary: 'Example',
  database_specific: { severity: 'HIGH' },
  affected: [
    {
      package: { name: 'lodash', ecosystem: 'npm' },
      ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }],
    },
  ],
  references: [{ url: 'https://example.org/advisory' }, { url: 'javascript:alert(1)' }],
};

test('normalizes evidence, ignores withdrawn records and merges advisory aliases', () => {
  const findings = normalizeAdvisories(dependency, [
    advisory,
    { ...advisory, id: 'CVE-2020-1', aliases: ['GHSA-test'] },
    { ...advisory, id: 'withdrawn', withdrawn: '2020-01-01' },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].advisory.severity, 'high');
  assert.deepEqual(findings[0].advisory.fixedVersions, ['4.17.21']);
  assert.ok(findings[0].advisory.references.every((url) => url.startsWith('https://')));
});

test('reports package failures instead of treating partial coverage as clean', async () => {
  const result = await scanDependencies(
    [dependency, { ...dependency, name: 'broken' }],
    async (dep) => {
      if (dep.name === 'broken') throw new Error('OSV unavailable');
      return [advisory];
    },
  );
  assert.equal(result.scanned, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.findings.length, 1);
  assert.match(result.errors[0], /broken/);
});

test('unrecognized provider severity stays unknown', () => {
  const findings = normalizeAdvisories(dependency, [
    { ...advisory, database_specific: { severity: 'constructor' } },
  ]);
  assert.equal(findings[0].advisory.severity, 'unknown');
});

test('rejects AI references and upgrade versions absent from supplied evidence', () => {
  const finding = normalizeAdvisories(dependency, [advisory])[0];
  const brief = {
    summary: 'Review dependency.',
    impact: 'Investigate runtime use.',
    steps: ['Check input flow.'],
    uncertainties: ['Reachability unknown.'],
    evidenceIds: ['GHSA-test'],
    suggestedVersion: '4.17.21',
  };
  assert.equal(validateBrief(brief, finding).suggestedVersion, '4.17.21');
  assert.throws(() => validateBrief({ ...brief, evidenceIds: ['invented'] }, finding), /evidence/);
  assert.throws(() => validateBrief({ ...brief, suggestedVersion: '99.0.0' }, finding), /version/);
});
