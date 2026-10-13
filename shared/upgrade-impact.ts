import type { Scan } from './types.js';

export interface ImpactOwner {
  location: string;
  package: string;
  version: string;
  affectedPackages: string[];
  findingKeys: string[];
  sharedFindingCount: number;
}
export interface UpgradeImpact {
  owners: ImpactOwner[];
  unownedFindingKeys: string[];
  totalFindings: number;
  unresolvedEdges: number;
  graphAvailable: boolean;
}

// Traverse each root independently: a shared transitive package belongs to every
// root that reaches it, regardless of hoisting or the explanatory path limit.
export function analyzeUpgradeImpact(scan: Scan): UpgradeImpact {
  const graph = scan.graph;
  const owners: ImpactOwner[] = [];
  if (graph?.rootDeclarations) {
    for (const root of [...new Set(graph.roots)]) {
      const reachable = new Set<string>();
      const queue = [root];
      for (let i = 0; i < queue.length; i++) {
        const location = queue[i];
        if (reachable.has(location)) continue;
        reachable.add(location);
        for (const child of graph.edges[location] ?? []) {
          if (!reachable.has(child)) queue.push(child);
        }
      }
      const findings = scan.findings.filter((f) =>
        f.dependency.locations.some((location) => reachable.has(location)),
      );
      if (!findings.length) continue;
      const dependency = scan.snapshot?.find((d) => d.locations.includes(root));
      owners.push({
        location: root,
        package: dependency?.name ?? root.replaceAll('node_modules/', ''),
        version: dependency?.version ?? 'unknown',
        affectedPackages: [
          ...new Set(findings.map((f) => `${f.dependency.name}@${f.dependency.version}`)),
        ].sort(),
        findingKeys: [...new Set(findings.map((f) => f.key))],
        sharedFindingCount: 0,
      });
    }
  }
  const counts = new Map<string, number>();
  for (const owner of owners) {
    for (const key of owner.findingKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const owner of owners) {
    owner.sharedFindingCount = owner.findingKeys.filter((key) => counts.get(key)! > 1).length;
  }
  return {
    owners: owners.sort(
      (a, b) => b.findingKeys.length - a.findingKeys.length || a.location.localeCompare(b.location),
    ),
    unownedFindingKeys: [
      ...new Set(scan.findings.filter((f) => !counts.has(f.key)).map((f) => f.key)),
    ],
    totalFindings: new Set(scan.findings.map((f) => f.key)).size,
    unresolvedEdges: graph?.unresolved ?? 0,
    graphAvailable: !!graph?.rootDeclarations,
  };
}
