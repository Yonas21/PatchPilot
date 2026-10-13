import type { DependencyGraph } from './workbench.js';
export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'unknown';
export type ScanStatus =
  'queued' | 'fetching' | 'scanning' | 'summarizing' | 'completed' | 'partial' | 'failed';

export interface Dependency {
  name: string;
  version: string;
  dev: boolean;
  locations: string[];
}
export interface SkippedDependency {
  location: string;
  reason: string;
}
export interface ParsedInventory {
  graph?: DependencyGraph;
  packages: Dependency[];
  skipped: SkippedDependency[];
}
export interface RepositorySource {
  owner: string;
  repo: string;
  ref: string;
  path: string;
  sha?: string;
}
export interface Inventory extends ParsedInventory {
  id: string;
  name: string;
  context: string;
  source: 'demo' | 'upload' | 'github';
  repository?: RepositorySource;
  createdAt: string;
  monitoring: boolean;
  nextRunAt: string | null;
}
export interface Advisory {
  id: string;
  aliases: string[];
  summary: string;
  details: string;
  severity: Severity;
  references: string[];
  fixedVersions: string[];
  modified?: string;
}
export interface Brief {
  summary: string;
  impact: string;
  steps: string[];
  uncertainties: string[];
  evidenceIds: string[];
  suggestedVersion: string | null;
  model: string;
  createdAt: string;
}
export interface Finding {
  key: string;
  dependency: Dependency;
  advisory: Advisory;
  brief?: Brief;
  briefError?: string;
}
export interface Scan {
  snapshot?: Dependency[];
  graph?: DependencyGraph;
  purpose?: 'source' | 'candidate';
  planId?: string;
  id: string;
  inventoryId: string;
  status: ScanStatus;
  trigger: 'manual' | 'scheduled';
  createdAt: string;
  completedAt?: string;
  total: number;
  scanned: number;
  failed: number;
  skipped: SkippedDependency[];
  findings: Finding[];
  errors: string[];
  newFindings: number;
  noLongerDetected: number;
  repositorySha?: string;
}
export interface Ticket {
  id: string;
  inventoryId: string;
  scanId: string;
  findingKey: string;
  title: string;
  body: string;
  status: 'open' | 'done';
  createdAt: string;
  updatedAt: string;
}
export interface Activity {
  id: string;
  kind: 'scan' | 'ticket' | 'monitor' | 'inventory' | 'ai';
  title: string;
  detail: string;
  createdAt: string;
}
export interface Dashboard {
  inventories: Inventory[];
  scans: Scan[];
  tickets: Ticket[];
  activity: Activity[];
  integrations: { gemini: boolean; model: string };
}
export const severityOrder: Record<Severity, number> = {
  critical: 0,
  high: 1,
  moderate: 2,
  low: 3,
  unknown: 4,
};
export const activeStatuses: ScanStatus[] = ['queued', 'fetching', 'scanning', 'summarizing'];
