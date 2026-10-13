import type { Finding, Scan } from './types.js';
import type { Comparison, FindingChange } from './workbench.js';

export function fullCoverage(scan: Scan): boolean {
  return (
    scan.status === 'completed' &&
    scan.failed === 0 &&
    scan.skipped.length === 0 &&
    scan.scanned === scan.total &&
    !!scan.snapshot &&
    scan.snapshot.length === scan.total
  );
}

export function compareScans(before: Scan, after: Scan): Comparison {
  if (before.inventoryId !== after.inventoryId)
    throw new Error('Choose scans from the same inventory.');
  if (before.id === after.id || Date.parse(after.createdAt) <= Date.parse(before.createdAt)) {
    throw new Error('Verification requires a newer scan than the baseline.');
  }
  const complete = fullCoverage(before) && fullCoverage(after);
  const groups: { package: string; ids: Set<string>; before: Finding[]; after: Finding[] }[] = [];
  for (const [side, scan] of [
    ['before', before],
    ['after', after],
  ] as const) {
    for (const finding of scan.findings) {
      const ids = [finding.advisory.id, ...finding.advisory.aliases];
      const matches = groups.filter(
        (g) => g.package === finding.dependency.name && ids.some((id) => g.ids.has(id)),
      );
      const group = {
        package: finding.dependency.name,
        ids: new Set(ids),
        before: [] as Finding[],
        after: [] as Finding[],
      };
      for (const match of matches) {
        match.ids.forEach((id) => group.ids.add(id));
        group.before.push(...match.before);
        group.after.push(...match.after);
        groups.splice(groups.indexOf(match), 1);
      }
      group[side].push(finding);
      groups.push(group);
    }
  }
  const changes: FindingChange[] = groups.map((g) => ({
    package: g.package,
    advisory: g.before[0]?.advisory.id ?? g.after[0].advisory.id,
    beforeVersions: [...new Set(g.before.map((f) => f.dependency.version))],
    afterVersions: [...new Set(g.after.map((f) => f.dependency.version))],
    state: g.before.length
      ? g.after.length
        ? 'persistent'
        : complete
          ? 'not-detected'
          : 'inconclusive'
      : 'new',
  }));
  const versions = (scan: Scan) => {
    const result = new Map<string, string[]>();
    for (const dep of scan.snapshot ?? [])
      result.set(dep.name, [...(result.get(dep.name) ?? []), dep.version]);
    return new Map(
      [...result].map(([name, values]) => [name, [...new Set(values)].sort().join(', ')]),
    );
  };
  const left = versions(before),
    right = versions(after);
  return {
    baselineId: before.id,
    candidateId: after.id,
    complete,
    reason: complete
      ? 'Both scans cover their full package snapshots. Absence means no published match detected; application tests and compatibility remain unverified.'
      : 'Incomplete coverage or a missing historical package snapshot prevents no-longer-detected claims.',
    changes,
    packages: {
      added: [...right.keys()].filter((name) => !left.has(name)),
      removed: [...left.keys()].filter((name) => !right.has(name)),
      changed: [...right]
        .filter(([name, value]) => left.has(name) && left.get(name) !== value)
        .map(([name, value]) => `${name}: ${left.get(name)} → ${value}`),
    },
  };
}
