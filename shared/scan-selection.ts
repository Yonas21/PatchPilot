import type { Finding, Scan } from './types.js';

export interface EvidenceRow {
  finding: Finding;
  scan: Scan;
  stale: boolean;
}

// Scans arrive newest first. Partial coverage cannot retire older evidence.
export function selectInventoryFindings(scans: Scan[], inventoryId: string): EvidenceRow[] {
  const history = scans.filter((scan) => scan.inventoryId === inventoryId);
  const rows = new Map<string, EvidenceRow>();
  for (const scan of history) {
    for (const finding of scan.findings) {
      if (!rows.has(finding.key))
        rows.set(finding.key, { finding, scan, stale: scan.id !== history[0].id });
    }
    if (scan.status === 'completed') break;
  }
  return [...rows.values()];
}

export function dashboardScans(scans: Scan[]): Scan[] {
  const keep = new Set(scans.slice(0, 60).map((scan) => scan.id));
  for (const inventoryId of new Set(scans.map((scan) => scan.inventoryId))) {
    const history = scans.filter((scan) => scan.inventoryId === inventoryId);
    if (history[0]) keep.add(history[0].id);
    for (const scan of history) {
      if (scan.findings.length || scan.status === 'completed') keep.add(scan.id);
      if (scan.status === 'completed') break;
    }
  }
  return scans.filter((scan) => keep.has(scan.id));
}
