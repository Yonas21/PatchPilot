import type { Severity } from './types.js';

export interface ReleasePolicy {
  id: string;
  minimumSeverity: Exclude<Severity, 'unknown'>;
  includeDevelopment: boolean;
  blockUnknown: boolean;
  maxAgeHours: number;
}
export const defaultPolicy: Omit<ReleasePolicy, 'id'> = {
  minimumSeverity: 'high',
  includeDevelopment: true,
  blockUnknown: true,
  maxAgeHours: 24,
};
export interface RiskException {
  id: string;
  inventoryId: string;
  findingKey: string;
  package: string;
  version: string;
  advisoryId: string;
  reason: string;
  owner: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}
export interface ReleaseFinding {
  key: string;
  package: string;
  version: string;
  advisory: string;
  severity: Severity;
  development: boolean;
  outcome: 'blocker' | 'excepted' | 'outside-policy';
  exceptionId?: string;
}
export interface ReleaseDecision {
  id: string;
  inventoryId: string;
  scanId: string;
  evaluatedAt: string;
  purpose: 'source' | 'candidate';
  repositorySha?: string;
  policy: ReleasePolicy;
  exceptions: RiskException[];
  outcome: 'blocked' | 'meets-policy' | 'meets-policy-with-exceptions';
  blockers: string[];
  findings: ReleaseFinding[];
}
export interface VersionCheck {
  id: string;
  planId: string;
  stepId: string;
  package: string;
  version: string;
  checkedAt: string;
  published: boolean;
  status: 'no-matches' | 'matches' | 'unavailable';
  advisories: { id: string; severity: Severity; summary: string }[];
  error?: string;
}
