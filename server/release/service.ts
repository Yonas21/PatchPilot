import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../store.js';
import { defaultPolicy, type RiskException, type ReleaseDecision } from '../../shared/release.js';
import { evaluateRelease } from '../../shared/release-policy.js';

export const policySchema = z.object({
  minimumSeverity: z.enum(['critical', 'high', 'moderate', 'low']),
  includeDevelopment: z.boolean(),
  blockUnknown: z.boolean(),
  maxAgeHours: z.number().int().min(1).max(168),
});
export const exceptionSchema = z.object({
  scanId: z.string(),
  findingKey: z.string(),
  owner: z.string().trim().min(2).max(100),
  reason: z.string().trim().min(20).max(2000),
  expiresAt: z.iso.datetime(),
  approved: z.literal(true),
});
export function grantException(
  store: Store,
  input: z.infer<typeof exceptionSchema>,
  now = new Date(),
): RiskException {
  const data = exceptionSchema.parse(input);
  const scan = store.get('scans', data.scanId),
    finding = scan?.findings.find((f) => f.key === data.findingKey);
  if (!scan || !finding) throw new Error('Finding not found in the selected scan.');
  if (!['completed', 'partial', 'failed'].includes(scan.status))
    throw new Error('Wait for this scan to finish.');
  const expiry = Date.parse(data.expiresAt);
  if (expiry <= now.getTime() || expiry > now.getTime() + 30 * 86400000)
    throw new Error('Exception expiry must be in the future and within 30 days.');
  const duplicate = store
    .list('exceptions')
    .find(
      (e) =>
        e.inventoryId === scan.inventoryId &&
        e.findingKey === finding.key &&
        !e.revokedAt &&
        Date.parse(e.expiresAt) > now.getTime(),
    );
  if (duplicate)
    throw new Error('An active exception already exists. Revoke it before replacing it.');
  const exception: RiskException = {
    id: randomUUID(),
    inventoryId: scan.inventoryId,
    findingKey: finding.key,
    package: finding.dependency.name,
    version: finding.dependency.version,
    advisoryId: finding.advisory.id,
    reason: data.reason,
    owner: data.owner,
    expiresAt: data.expiresAt,
    createdAt: now.toISOString(),
  };
  store.put('exceptions', exception);
  store.event(
    'ticket',
    'Time-limited exception approved',
    `${exception.package}@${exception.version} · ${exception.advisoryId} · ${exception.owner} · expires ${exception.expiresAt}`,
  );
  return exception;
}
export function recordDecision(store: Store, scanId: string): ReleaseDecision {
  const scan = store.get('scans', scanId);
  if (!scan) throw new Error('Scan not found.');
  const policy = store.get('policies', scan.inventoryId) ?? {
    id: scan.inventoryId,
    ...defaultPolicy,
  };
  const latest = store
    .list('scans')
    .find((s) => s.inventoryId === scan.inventoryId && s.purpose !== 'candidate');
  const decision = {
    id: randomUUID(),
    ...evaluateRelease(scan, policy, store.list('exceptions'), latest?.id),
  };
  store.put('decisions', decision);
  store.event(
    'ticket',
    'Release review recorded',
    `${scan.purpose === 'candidate' ? 'Candidate experiment' : 'Source evidence'} · ${decision.outcome} · scan ${scan.id.slice(0, 8)}`,
  );
  return decision;
}
export function exportDecision(d: ReleaseDecision): string {
  return [
    `# Release review: ${d.outcome}`,
    `Evaluated: ${d.evaluatedAt}`,
    `Scan: ${d.scanId} · ${d.purpose === 'candidate' ? 'UPLOADED CANDIDATE EXPERIMENT' : 'SOURCE SCAN'} · commit ${d.repositorySha ?? 'not recorded'}`,
    'This is a historical policy evaluation, not a release authorization or security certification. Exceptions and evidence age must be re-evaluated before a later release.',
    '## Criteria',
    `Severity threshold: ${d.policy.minimumSeverity}\nDevelopment dependencies: ${d.policy.includeDevelopment ? 'included' : 'excluded'}\nUnknown severity blocks: ${d.policy.blockUnknown}\nMaximum evidence age: ${d.policy.maxAgeHours} hours`,
    '## Blockers',
    ...(d.blockers.length
      ? d.blockers.map((b) => `- ${b}`)
      : ['None under the recorded criteria.']),
    '## Findings',
    ...d.findings.map(
      (f) => `- ${f.package}@${f.version} · ${f.advisory} · ${f.severity} · ${f.outcome}`,
    ),
    '## Applied exceptions',
    ...d.exceptions.map(
      (e) =>
        `- ${e.id}: ${e.package}@${e.version} · ${e.owner}\n  Expires: ${e.expiresAt}\n  Reason: ${e.reason}`,
    ),
    '## Boundaries',
    'No application tests, runtime reachability, compatibility, code changes, or deployment are verified by this decision.',
  ].join('\n\n');
}
