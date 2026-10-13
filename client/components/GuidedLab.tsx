import type { PlanSummary, ScanSummary } from '../../shared/workbench';
import { post } from '../api';

export function GuidedLab({
  plan,
  latest,
  isLab,
  busy,
  run,
  selectInventory,
}: {
  plan?: PlanSummary;
  latest?: ScanSummary;
  isLab: boolean;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
  selectInventory: (id: string) => void;
}) {
  const comparison = plan?.verifications.at(-1)?.comparison;
  const steps = [
    {
      title: 'Capture the baseline',
      done: isLab && latest?.status === 'completed',
      detail: 'Create the synthetic inventory below. Wait for its live advisory scan to finish.',
    },
    {
      title: 'Choose an investigation',
      done: isLab && !!plan,
      detail:
        'Click Prepare plan. Explore dependency owners and check proposed versions against live evidence.',
    },
    {
      title: 'Approve the plan',
      done: isLab && !!plan?.approvedAt,
      detail: 'Review the proposed changes, then explicitly approve the plan.',
    },
    {
      title: 'Compare a candidate',
      done: isLab && !!comparison,
      detail:
        'Scan the lab candidate below, then select its completed scan in verification and record the comparison.',
    },
  ];
  return (
    <details className="panel workbench-lab">
      <summary>Guided remediation demo</summary>
      <p>
        Follow a complete decision: baseline → investigation → approval → candidate evidence. The
        synthetic candidate upgrades minimist and deliberately leaves lodash unchanged.
      </p>
      <ol className="demo-steps">
        {steps.map((step) => (
          <li key={step.title}>
            <strong>
              {step.done ? '✓' : '○'} {step.title}
            </strong>
            <p>{step.detail}</p>
          </li>
        ))}
      </ol>
      <div className="workbench-actions">
        <button
          className="button button-outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await post<{ inventory: { id: string } }>('/workbench/demo');
              selectInventory(result.inventory.id);
            })
          }
        >
          Create lab inventory
        </button>
        <button
          className="button button-primary"
          disabled={busy || !isLab || !plan?.approvedAt}
          onClick={() => void run(() => post(`/workbench/plans/${plan!.id}/demo-candidate`))}
        >
          Scan lab candidate
        </button>
        <a className="button button-outline" href="/api/workbench/demo-candidate" download>
          Download candidate lockfile
        </a>
      </div>
      {isLab && comparison && (
        <p role="status">
          Latest comparison: {comparison.changes.filter((c) => c.state === 'not-detected').length}{' '}
          advisory groups not detected,{' '}
          {comparison.changes.filter((c) => c.state === 'persistent').length} persistent,{' '}
          {comparison.changes.filter((c) => c.state === 'new').length} new,{' '}
          {comparison.changes.filter((c) => c.state === 'inconclusive').length} inconclusive.
        </p>
      )}
      <p>
        Next, open Release review for this lab to record a decision. In Agent evaluations, run the
        partial-scan scenario to demonstrate why incomplete evidence cannot establish a fix.
      </p>
      <p className="muted">
        Both lab scans use live OSV evidence, so outcomes may change. No project code is installed
        or executed. The scan button uses the same synthetic lockfile available for download; real
        projects use the upload flow.
      </p>
    </details>
  );
}
