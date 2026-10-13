import { PagedList } from './Pagination';
import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import type { PlanSummary } from '../../shared/workbench';
import type { VersionCheck } from '../../shared/release';
import { api, post, dateTime } from '../api';
import { Spinner } from './Shared';

export function CandidateChecks({ plan }: { plan: PlanSummary }) {
  const [stepId, setStepId] = useState(plan.steps[0]?.id ?? '');
  const [version, setVersion] = useState('');
  const [checks, setChecks] = useState<VersionCheck[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void api<VersionCheck[]>(`/release/version-checks/${plan.id}`)
      .then((r) => {
        if (live) setChecks(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [plan.id]);
  const step = plan.steps.find((s) => s.id === stepId) ?? plan.steps[0];
  const target = step?.candidateVersions.includes(version)
    ? version
    : (step?.candidateVersions[0] ?? '');
  async function check() {
    setBusy(true);
    setError('');
    try {
      const result = await post<VersionCheck>(`/release/version-checks/${plan.id}`, {
        stepId: step.id,
        version: target,
      });
      setChecks((previous) => [result, ...previous]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const latest = checks.find((c) => c.stepId === step?.id && c.version === target);
  return (
    <section className="panel candidate-check-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">VALIDATE THE NEXT MOVE</p>
          <h2>
            <FlaskConical size={19} />
            Check an upgrade candidate
          </h2>
          <p>Confirm the version exists, then query its current published advisory matches.</p>
        </div>
      </div>
      <div className="release-body">
        <div className="release-columns">
          <label className="field">
            Package change
            <select
              value={step?.id ?? ''}
              onChange={(e) => {
                setStepId(e.target.value);
                setVersion('');
              }}
            >
              {plan.steps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Proposed version
            <select value={target} onChange={(e) => setVersion(e.target.value)}>
              {!step?.candidateVersions.length && <option value="">No candidate supplied</option>}
              {step?.candidateVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="button button-primary"
          disabled={busy || !target}
          onClick={() => void check()}
        >
          {busy ? <Spinner label="Checking registry and OSV…" /> : 'Check candidate evidence'}
        </button>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {latest && (
          <div
            className={`comparison-banner ${latest.status === 'no-matches' ? 'complete' : 'incomplete'}`}
          >
            <strong>
              {latest.status === 'no-matches'
                ? 'Published version · no OSV matches'
                : latest.status === 'matches'
                  ? `Published version · ${latest.advisories.length} advisory matches`
                  : 'Candidate verification unavailable'}
            </strong>
            <p>
              {latest.package}@{latest.version} · Checked {dateTime(latest.checkedAt)}
            </p>
            {latest.error && <p>{latest.error}</p>}
            {latest.advisories.length > 0 && (
              <PagedList
                items={latest.advisories}
                label="Candidate advisories"
                size={10}
                key={latest.id}
              >
                {(pageItems) => (
                  <ul>
                    {pageItems.map((a) => (
                      <li key={a.id}>
                        <a
                          href={`https://osv.dev/vulnerability/${encodeURIComponent(a.id)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.id}
                        </a>{' '}
                        · {a.severity} · {a.summary}
                      </li>
                    ))}
                  </ul>
                )}
              </PagedList>
            )}
          </div>
        )}
        <p className="muted">
          Checks use public npm metadata and OSV; packages are never installed. No matches does not
          prove compatibility, runtime safety, or that transitive dependencies are fixed. Query
          results may be cached for up to 15 minutes.
        </p>
        {checks.length > 1 && (
          <details>
            <summary>Check history ({checks.length})</summary>
            <PagedList items={checks} label="Candidate check history" size={10}>
              {(pageItems) => (
                <ul>
                  {pageItems.map((c) => (
                    <li key={c.id}>
                      {c.package}@{c.version} · {c.status} · {dateTime(c.checkedAt)}
                    </li>
                  ))}
                </ul>
              )}
            </PagedList>
          </details>
        )}
      </div>
    </section>
  );
}
