import type { Dependency, Finding, Severity } from './types.js';

export interface DependencyGraph {
  roots: string[];
  edges: Record<string, string[]>;
  unresolved: number;
  rootDeclarations: boolean;
}
export interface PlanStep {
  id: string;
  package: string;
  version: string;
  severity: Severity;
  runtime: boolean;
  findingKeys: string[];
  evidenceIds: string[];
  candidateVersions: string[];
  direct: boolean;
  paths: string[][];
  action: string;
}
export interface FindingChange {
  package: string;
  advisory: string;
  beforeVersions: string[];
  afterVersions: string[];
  state: 'persistent' | 'new' | 'not-detected' | 'inconclusive';
}
export interface Comparison {
  baselineId: string;
  candidateId: string;
  complete: boolean;
  reason: string;
  changes: FindingChange[];
  packages: { added: string[]; removed: string[]; changed: string[] };
}
export interface Verification {
  id: string;
  createdAt: string;
  comparison: Comparison;
}
export interface RemediationPlan {
  id: string;
  inventoryId: string;
  baselineId: string;
  title: string;
  createdAt: string;
  approvedAt?: string;
  steps: PlanStep[];
  findings: Finding[];
  snapshot: Dependency[];
  limitations: string[];
  verifications: Verification[];
}

export type PlanSummary = Omit<RemediationPlan, 'snapshot' | 'findings'> & { findingCount: number };
export type ScanSummary = Pick<
  import('./types.js').Scan,
  'id' | 'inventoryId' | 'createdAt' | 'status' | 'purpose' | 'planId' | 'scanned' | 'total'
> & {
  hasSnapshot: boolean;
  findingCount: number;
};
