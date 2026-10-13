import type { Scan } from './types.js';
import { severityOrder } from './types.js';
import type { DependencyGraph, PlanStep } from './workbench.js';

export function dependencyPaths(
  graph: DependencyGraph | undefined,
  locations: string[],
): string[][] {
  if (!graph?.rootDeclarations) return [];
  const targets = new Set(locations);
  const paths: string[][] = [];
  const queue = graph.roots.map((root) => [root]);
  const visited = new Set<string>();
  // Show a bounded set of explanatory paths; never enumerate every possible cycle/path.
  for (let i = 0; i < queue.length && i < 6000 && paths.length < 3; i++) {
    const path = queue[i];
    const tail = path[path.length - 1];
    if (targets.has(tail)) paths.push(path);
    if (visited.has(tail) || path.length >= 30) continue;
    visited.add(tail);
    for (const child of graph.edges[tail] ?? []) {
      if (!path.includes(child)) queue.push([...path, child]);
    }
  }
  return paths;
}

export function buildPlanSteps(scan: Scan): PlanStep[] {
  const groups = new Map<string, PlanStep>();
  for (const finding of scan.findings) {
    const dependency = finding.dependency;
    const id = `${dependency.name}@${dependency.version}`;
    const existing = groups.get(id);
    if (existing) {
      existing.findingKeys.push(finding.key);
      existing.evidenceIds = [...new Set([...existing.evidenceIds, finding.advisory.id])];
      existing.candidateVersions = [
        ...new Set([...existing.candidateVersions, ...finding.advisory.fixedVersions]),
      ];
      if (severityOrder[finding.advisory.severity] < severityOrder[existing.severity])
        existing.severity = finding.advisory.severity;
      continue;
    }
    const direct = dependency.locations.some((location) => scan.graph?.roots.includes(location));
    groups.set(id, {
      id,
      package: dependency.name,
      version: dependency.version,
      severity: finding.advisory.severity,
      runtime: !dependency.dev,
      findingKeys: [finding.key],
      evidenceIds: [finding.advisory.id],
      candidateVersions: [...finding.advisory.fixedVersions],
      direct,
      paths: dependencyPaths(scan.graph, dependency.locations),
      action: direct
        ? 'Evaluate a direct dependency upgrade and regenerate the lockfile.'
        : scan.graph?.rootDeclarations
          ? 'Investigate the parent dependency before choosing an upgrade or override.'
          : 'Confirm the direct dependency in package.json before choosing the upgrade route.',
    });
  }
  return [...groups.values()].sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      Number(b.runtime) - Number(a.runtime) ||
      b.findingKeys.length - a.findingKeys.length ||
      a.id.localeCompare(b.id),
  );
}
