import { usePagination } from '../hooks/usePagination';
import { Pagination } from './Pagination';
import { UpgradeImpact } from './UpgradeImpact';
import { CandidateChecks } from './CandidateChecks';
import { CheckCircle2, Download, GitBranch, ShieldCheck } from 'lucide-react';
import type { PlanSummary, ScanSummary } from '../../shared/workbench';
import { post, dateTime } from '../api';
import { Badge } from './Shared';
import { VerificationPanel } from './VerificationPanel';

export function PlanDetail({
  plan,
  scans,
  busy,
  run,
}: {
  plan: PlanSummary;
  scans: ScanSummary[];
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const pagination = usePagination(plan.steps, 10, plan.id);
  const latest = scans.find((s) => s.inventoryId === plan.inventoryId && s.purpose !== 'candidate');
  const stale = !plan.approvedAt && latest?.id !== plan.baselineId;
  return (
    <>
      <section className="panel plan-header">
        <div>
          <p className="eyebrow">IMMUTABLE BASELINE · {plan.baselineId.slice(0, 8)}</p>
          <h2>{plan.title}</h2>
          <p>
            {plan.approvedAt
              ? `Approved ${dateTime(plan.approvedAt)}`
              : 'Draft · review before approval'}
          </p>
        </div>
        <div className="workbench-actions">
          <a
            className="button button-outline"
            href={`/api/workbench/plans/${plan.id}/export`}
            download
          >
            <Download size={15} />
            Export plan
          </a>
          {!plan.approvedAt ? (
            <button
              className="button button-primary"
              disabled={busy || stale}
              onClick={() =>
                void run(() => post(`/workbench/plans/${plan.id}/approve`, { approved: true }))
              }
            >
              <CheckCircle2 size={16} />
              Approve this plan
            </button>
          ) : (
            <span className="tag tag-green">
              <ShieldCheck size={15} />
              Approved
            </span>
          )}
        </div>
        {stale && (
          <p className="error-text">
            New source evidence is available. Prepare a new plan before approval.
          </p>
        )}
      </section>
      <div className="plan-metrics">
        <div>
          <strong>{plan.findingCount}</strong>
          <span>advisory matches</span>
        </div>
        <div>
          <strong>{plan.steps.length}</strong>
          <span>package changes to review</span>
        </div>
        <div>
          <strong>{plan.steps.filter((s) => s.direct).length}</strong>
          <span>confirmed direct dependencies</span>
        </div>
        <div>
          <strong>{plan.verifications.length}</strong>
          <span>recorded comparisons</span>
        </div>
      </div>
      <UpgradeImpact planId={plan.id} />
      <section className="plan-step-list" aria-label="Proposed package changes">
        {pagination.items.map((step, index) => (
          <details className="panel plan-step" key={step.id} open={index === 0}>
            <summary>
              <span className="plan-step-number">{pagination.start + index + 1}</span>
              <span className="plan-step-title">
                <strong>{step.id}</strong>
                <small>
                  {step.findingKeys.length} advisory matches ·{' '}
                  {step.runtime ? 'runtime' : 'development'} ·{' '}
                  {step.direct ? 'direct dependency' : 'investigate ownership'}
                </small>
              </span>
              <Badge severity={step.severity} />
            </summary>
            <div className="plan-step-body">
              <p>{step.action}</p>
              <div className="plan-evidence">
                <strong>Evidence</strong>
                <div>
                  {step.evidenceIds.map((id) => (
                    <a
                      key={id}
                      href={`https://osv.dev/vulnerability/${encodeURIComponent(id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {id}
                    </a>
                  ))}
                </div>
              </div>
              <div className="plan-candidates">
                <strong>Advisory upgrade candidates</strong>
                <p>{step.candidateVersions.join(', ') || 'No fixed version was supplied.'}</p>
                <small>
                  These versions may address different advisories or release branches. No combined
                  fix or application compatibility is assumed.
                </small>
              </div>
              <div className="plan-paths">
                <strong>
                  <GitBranch size={15} />
                  Dependency paths
                </strong>
                {step.paths.length ? (
                  step.paths.map((path, i) => (
                    <ol key={i}>
                      {path.map((location, j) => (
                        <li key={`${j}:${location}`}>
                          <code>{location.replaceAll('node_modules/', '')}</code>
                        </li>
                      ))}
                    </ol>
                  ))
                ) : (
                  <p>
                    No confirmed root-to-package path is available. Check package.json and
                    unresolved dependency edges.
                  </p>
                )}
              </div>
              <details>
                <summary>Investigation checklist</summary>
                <ul>
                  <li>
                    Confirm whether affected functionality is used and exposed to untrusted input.
                  </li>
                  <li>Review the parent constraint, release notes, and proposed version.</li>
                  <li>Regenerate the lockfile in your project and run application tests.</li>
                  <li>
                    Upload the resulting lockfile below to compare published advisory matches.
                  </li>
                </ul>
              </details>
            </div>
          </details>
        ))}
        <Pagination pagination={pagination} label="Package changes" />
      </section>
      <details className="panel workbench-lab">
        <summary>Evidence limits and review responsibilities</summary>
        <ul>
          {plan.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
      <CandidateChecks plan={plan} />
      <VerificationPanel plan={plan} scans={scans} busy={busy} run={run} />
    </>
  );
}
