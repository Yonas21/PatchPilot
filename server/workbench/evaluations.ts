import type { Finding, Scan } from '../../shared/types.js';
import type { EvaluationReport, EvaluationResult } from '../../shared/evaluation.js';
import { compareScans } from '../../shared/scan-comparison.js';
import { defaultPolicy } from '../../shared/release.js';
import { evaluateRelease } from '../../shared/release-policy.js';
import { validateBrief } from '../providers/gemini.js';

export function runEvaluations(): EvaluationReport {
  const now = new Date();
  const finding: Finding = {
    key: 'synthetic:leaf:advisory',
    dependency: {
      name: 'synthetic-leaf',
      version: '1.0.0',
      dev: false,
      locations: ['node_modules/synthetic-leaf'],
    },
    advisory: {
      id: 'SYNTHETIC-001',
      aliases: [],
      severity: 'high',
      summary: 'Synthetic evaluation',
      details: '',
      references: [],
      fixedVersions: ['1.0.1'],
    },
  };
  const baseline: Scan = {
    id: 'evaluation-baseline',
    inventoryId: 'evaluation-only',
    status: 'completed',
    trigger: 'manual',
    createdAt: new Date(now.getTime() - 1000).toISOString(),
    completedAt: now.toISOString(),
    total: 1,
    scanned: 1,
    failed: 0,
    skipped: [],
    findings: [finding],
    errors: [],
    newFindings: 1,
    noLongerDetected: 0,
    snapshot: [finding.dependency],
  };
  const candidate: Scan = {
    ...baseline,
    id: 'evaluation-candidate',
    purpose: 'candidate',
    createdAt: now.toISOString(),
    findings: [],
  };
  const brief = {
    summary: 'Review the supplied advisory.',
    impact: 'Application exposure is unknown.',
    steps: ['Evaluate version 1.0.1 and run tests.'],
    uncertainties: ['Compatibility is unverified.'],
    evidenceIds: ['SYNTHETIC-001'],
    suggestedVersion: '1.0.1',
  };
  const results: EvaluationResult[] = [];
  function check(
    id: string,
    name: string,
    category: EvaluationResult['category'],
    expected: string,
    work: () => string,
  ) {
    let actual: string;
    let detail = '';
    try {
      actual = work();
    } catch (error) {
      actual = 'error';
      detail = error instanceof Error ? error.message : 'Unexpected evaluation failure';
    }
    results.push({ id, name, category, expected, actual, passed: actual === expected, detail });
  }
  function validate(input: unknown) {
    try {
      validateBrief(input, finding);
      return 'accepted';
    } catch (error) {
      // An unexpected implementation error must fail, not masquerade as rejection.
      if (error instanceof Error && /AI brief/.test(error.message)) return 'rejected';
      throw error;
    }
  }
  check('grounded', 'Grounded brief is accepted', 'AI output validation', 'accepted', () =>
    validate(brief),
  );
  check(
    'invented-id',
    'Invented advisory citation is rejected',
    'AI output validation',
    'rejected',
    () => validate({ ...brief, evidenceIds: ['SYNTHETIC-INVENTED'] }),
  );
  check(
    'invented-version',
    'Unsupported upgrade suggestion is rejected',
    'AI output validation',
    'rejected',
    () => validate({ ...brief, suggestedVersion: '9.9.9' }),
  );
  check(
    'prose-version',
    'Unsupported version hidden in prose is rejected',
    'AI output validation',
    'rejected',
    () => validate({ ...brief, summary: 'Upgrade to 9.9.9.' }),
  );
  check(
    'complete',
    'Complete comparison can report disappearance',
    'Evidence completeness',
    'not-detected',
    () => compareScans(baseline, candidate).changes[0].state,
  );
  check(
    'partial',
    'Partial scan cannot establish disappearance',
    'Evidence completeness',
    'inconclusive',
    () => compareScans(baseline, { ...candidate, status: 'partial', failed: 1 }).changes[0].state,
  );
  check(
    'persistent',
    'Remaining advisory stays visible',
    'Evidence completeness',
    'persistent',
    () => compareScans(baseline, { ...candidate, findings: [finding] }).changes[0].state,
  );
  const policy = { ...defaultPolicy, id: baseline.inventoryId };
  check(
    'clean',
    'Complete current evidence can meet criteria',
    'Release criteria',
    'meets-policy',
    () => evaluateRelease(candidate, policy, [], baseline.id, now).outcome,
  );
  check(
    'incomplete',
    'Incomplete evidence blocks release review',
    'Release criteria',
    'blocked',
    () => evaluateRelease({ ...candidate, scanned: 0 }, policy, [], baseline.id, now).outcome,
  );
  check(
    'stale',
    'Stale evidence blocks release review',
    'Release criteria',
    'blocked',
    () =>
      evaluateRelease(
        { ...candidate, completedAt: new Date(now.getTime() - 25 * 3600000).toISOString() },
        policy,
        [],
        baseline.id,
        now,
      ).outcome,
  );
  check(
    'conflicting',
    'Newer source evidence invalidates the older decision input',
    'Release criteria',
    'blocked',
    () => evaluateRelease({ ...baseline, findings: [] }, policy, [], 'newer-source', now).outcome,
  );
  return {
    suite: 'evidence-guards-v1',
    executedAt: now.toISOString(),
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    results,
  };
}
