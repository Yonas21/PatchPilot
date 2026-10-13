import { randomUUID } from 'node:crypto';
import type { Store } from '../store.js';
import { buildPlanSteps } from '../../shared/plan-builder.js';
import { compareScans, fullCoverage } from '../../shared/scan-comparison.js';
import type { RemediationPlan } from '../../shared/workbench.js';

export function createPlan(store: Store, scanId: string): RemediationPlan {
  const scan = store.get('scans', scanId);
  if (!scan || scan.purpose === 'candidate' || !fullCoverage(scan)) {
    throw new Error(
      'Create a plan from a complete source scan with a package snapshot. Run a new scan if this is historical data.',
    );
  }
  if (!scan.findings.length) throw new Error('This scan has no findings to plan.');
  const previous = store.list('plans').find((p) => p.baselineId === scanId);
  if (previous) return previous;
  const inventory = store.get('inventories', scan.inventoryId)!;
  const plan: RemediationPlan = {
    id: randomUUID(),
    inventoryId: inventory.id,
    baselineId: scan.id,
    title: `Remediation plan · ${inventory.name}`,
    createdAt: new Date().toISOString(),
    steps: buildPlanSteps(scan),
    findings: scan.findings,
    snapshot: scan.snapshot!,
    limitations: [
      'Candidate versions are advisory boundaries, not a combined safe upgrade or a compatibility guarantee.',
      'Dependency paths describe installation relationships, not application reachability.',
      ...(scan.graph?.rootDeclarations
        ? []
        : [
            'Root declarations are unavailable. Direct versus transitive ownership must be checked in package.json.',
          ]),
      ...(scan.graph?.unresolved
        ? [`${scan.graph.unresolved} dependency edges could not be resolved.`]
        : []),
      'Run your application tests separately. PatchPilot does not install or execute imported projects.',
    ],
    verifications: [],
  };
  store.put('plans', plan);
  store.event(
    'ticket',
    'Remediation plan prepared',
    `${inventory.name} · ${plan.findings.length} findings grouped into ${plan.steps.length} package changes`,
  );
  return plan;
}
export function approvePlan(store: Store, id: string): RemediationPlan {
  const plan = store.get('plans', id);
  if (!plan) throw new Error('Plan not found.');
  if (plan.approvedAt) return plan;
  const latest = store
    .list('scans')
    .find((s) => s.inventoryId === plan.inventoryId && s.purpose !== 'candidate');
  if (latest?.id !== plan.baselineId)
    throw new Error(
      'Source evidence changed. Create a plan from the latest completed source scan.',
    );
  const approved = { ...plan, approvedAt: new Date().toISOString() };
  store.put('plans', approved);
  store.event(
    'ticket',
    'Remediation plan approved',
    `${plan.title} · ${plan.steps.length} package changes`,
  );
  return approved;
}
export function verifyPlan(store: Store, id: string, scanId: string): RemediationPlan {
  const plan = store.get('plans', id);
  if (!plan?.approvedAt) throw new Error('Approve the plan before recording verification.');
  const before = store.get('scans', plan.baselineId),
    after = store.get('scans', scanId);
  if (!before || !after) throw new Error('Scan not found.');
  if (!['completed', 'partial', 'failed'].includes(after.status))
    throw new Error('Wait for the scan to finish.');
  if (after.purpose === 'candidate' && after.planId !== plan.id)
    throw new Error('This candidate belongs to another plan.');
  if (plan.verifications.some((v) => v.comparison.candidateId === scanId)) return plan;
  const comparison = compareScans(before, after);
  const updated = {
    ...plan,
    verifications: [
      ...plan.verifications,
      { id: randomUUID(), createdAt: new Date().toISOString(), comparison },
    ],
  };
  store.put('plans', updated);
  const absent = comparison.changes.filter((c) => c.state === 'not-detected').length;
  store.event(
    'ticket',
    'Plan verification recorded',
    `${plan.title} · ${absent} advisory groups no longer detected · ${comparison.complete ? 'complete coverage' : 'inconclusive coverage'}`,
  );
  return updated;
}
export function exportPlan(plan: RemediationPlan): string {
  return [
    `# ${plan.title}`,
    `Baseline: ${plan.baselineId}`,
    `Approval: ${plan.approvedAt ?? 'Draft — not approved'}`,
    '## Package changes',
    ...plan.steps.map((s, i) =>
      [
        `### ${i + 1}. ${s.id}`,
        `${s.severity} · ${s.runtime ? 'runtime' : 'development'} · ${s.findingKeys.length} findings`,
        s.action,
        `Evidence: ${s.evidenceIds.join(', ')}`,
        `Unverified advisory candidates: ${s.candidateVersions.join(', ') || 'None supplied'}`,
        ...s.paths.map((path) => `Dependency path: ${path.join(' → ')}`),
      ].join('\n\n'),
    ),
    '## Limitations',
    ...plan.limitations.map((l) => `- ${l}`),
    '## Verification',
    ...plan.verifications.map(
      (v) =>
        `${v.createdAt} · scan ${v.comparison.candidateId}\n${v.comparison.reason}\n${v.comparison.changes.map((c) => `- ${c.package} ${c.advisory}: ${c.state}`).join('\n')}`,
    ),
  ].join('\n\n');
}
