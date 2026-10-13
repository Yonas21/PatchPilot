import { severityOrder, type Scan } from './types.js';
import { fullCoverage } from './scan-comparison.js';
import type { ReleaseDecision, ReleasePolicy, RiskException } from './release.js';

export function evaluateRelease(
  scan: Scan,
  policy: ReleasePolicy,
  exceptions: RiskException[],
  latestSourceId: string | undefined,
  now = new Date(),
): Omit<ReleaseDecision, 'id'> {
  const blockers: string[] = [];
  if (!fullCoverage(scan)) blockers.push('A complete scan with a package snapshot is required.');
  const finished = Date.parse(scan.completedAt ?? '');
  if (
    !Number.isFinite(finished) ||
    finished > now.getTime() ||
    now.getTime() - finished > policy.maxAgeHours * 3600000
  )
    blockers.push(`Evidence is missing, future-dated, or older than ${policy.maxAgeHours} hours.`);
  if (scan.purpose !== 'candidate' && scan.id !== latestSourceId)
    blockers.push('A newer source scan exists. Evaluate the latest source evidence.');
  const active = exceptions.filter(
    (e) =>
      e.inventoryId === scan.inventoryId &&
      !e.revokedAt &&
      Date.parse(e.createdAt) <= now.getTime() &&
      Date.parse(e.expiresAt) > now.getTime(),
  );
  const findings = scan.findings.map((f) => {
    const covered =
      (policy.includeDevelopment || !f.dependency.dev) &&
      (f.advisory.severity === 'unknown'
        ? policy.blockUnknown
        : severityOrder[f.advisory.severity] <= severityOrder[policy.minimumSeverity]);
    const exception = active.find(
      (e) =>
        e.findingKey === f.key &&
        e.package === f.dependency.name &&
        e.version === f.dependency.version &&
        e.advisoryId === f.advisory.id,
    );
    return {
      key: f.key,
      package: f.dependency.name,
      version: f.dependency.version,
      advisory: f.advisory.id,
      severity: f.advisory.severity,
      development: f.dependency.dev,
      outcome: !covered
        ? ('outside-policy' as const)
        : exception
          ? ('excepted' as const)
          : ('blocker' as const),
      exceptionId: covered ? exception?.id : undefined,
    };
  });
  const count = findings.filter((f) => f.outcome === 'blocker').length;
  if (count) blockers.push(`${count} advisory matches exceed the configured release criteria.`);
  const used = active.filter((e) => findings.some((f) => f.exceptionId === e.id));
  return {
    inventoryId: scan.inventoryId,
    scanId: scan.id,
    evaluatedAt: now.toISOString(),
    purpose: scan.purpose ?? 'source',
    repositorySha: scan.repositorySha,
    policy: { ...policy },
    exceptions: used,
    outcome: blockers.length
      ? 'blocked'
      : used.length
        ? 'meets-policy-with-exceptions'
        : 'meets-policy',
    blockers,
    findings,
  };
}
