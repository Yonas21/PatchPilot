import { usePagination } from '../hooks/usePagination';
import { Pagination, PagedList } from './Pagination';
import { useState } from 'react';
import { ArrowRight, FileCheck2, Upload } from 'lucide-react';
import { activeStatuses } from '../../shared/types';
import type { PlanSummary, ScanSummary } from '../../shared/workbench';
import { post, dateTime } from '../api';

export function VerificationPanel({
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
  const [file, setFile] = useState<File | null>(null);
  const [scanId, setScanId] = useState('');
  const [filter, setFilter] = useState('all');
  const eligible = scans.filter(
    (s) =>
      s.inventoryId === plan.inventoryId &&
      Date.parse(s.createdAt) > Date.parse(plan.createdAt) &&
      (!s.planId || s.planId === plan.id),
  );
  const current = eligible.find((s) => s.id === scanId) ?? eligible[0];
  const running = scans.some(
    (s) => s.inventoryId === plan.inventoryId && activeStatuses.includes(s.status),
  );
  const verification = plan.verifications.at(-1);
  const comparison = verification?.comparison;
  const changes = comparison?.changes.filter((c) => filter === 'all' || c.state === filter) ?? [];
  const pagination = usePagination(changes, 25, `${comparison?.candidateId}:${filter}`);
  const counts = (state: string) =>
    comparison?.changes.filter((c) => c.state === state).length ?? 0;
  return (
    <section className="panel verification-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">CLOSE THE EVIDENCE LOOP</p>
          <h2>
            <FileCheck2 size={20} />
            Verify a candidate
          </h2>
          <p>Compare a later source scan or an uploaded candidate against the approved baseline.</p>
        </div>
      </div>
      <div className="verification-body">
        {!plan.approvedAt ? (
          <p>Approve this plan to unlock candidate scanning and recorded comparisons.</p>
        ) : (
          <>
            <div className="verification-upload">
              <label className="field">
                Candidate package-lock.json
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                className="button button-primary"
                disabled={busy || !file || running}
                onClick={() =>
                  void run(async () => {
                    if (!file || file.size > 1024 * 1024)
                      throw new Error('Choose a JSON lockfile up to 1 MiB.');
                    let lockfile;
                    try {
                      lockfile = JSON.parse(await file.text());
                    } catch {
                      throw new Error('Candidate file is not valid JSON.');
                    }
                    const scan = await post<ScanSummary>(`/workbench/plans/${plan.id}/candidate`, {
                      lockfile,
                    });
                    setScanId(scan.id);
                  })
                }
              >
                <Upload size={16} />
                Scan candidate
              </button>
            </div>
            <p className="muted">
              Candidate uploads are separate experiments. They do not change the monitored source or
              prove that your repository was patched.
            </p>
            <label className="field">
              Scan to compare
              <select value={current?.id ?? ''} onChange={(e) => setScanId(e.target.value)}>
                {!eligible.length && (
                  <option value="">Upload a candidate or run a newer source scan</option>
                )}
                {eligible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.purpose === 'candidate' ? 'Uploaded candidate' : 'Source scan'} ·{' '}
                    {dateTime(s.createdAt)} · {s.status} ({s.scanned}/{s.total})
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-outline"
              disabled={busy || !current || activeStatuses.includes(current.status)}
              onClick={() =>
                void run(() => post(`/workbench/plans/${plan.id}/verify`, { scanId: current!.id }))
              }
            >
              Record comparison
              <ArrowRight size={15} />
            </button>
            {current && activeStatuses.includes(current.status) && (
              <p role="status">
                Candidate progress: {current.status} · {current.scanned}/{current.total} checked
              </p>
            )}
          </>
        )}
        {comparison && (
          <div className="comparison-result">
            <div className={`comparison-banner ${comparison.complete ? 'complete' : 'incomplete'}`}>
              <strong>
                {comparison.complete ? 'Comparison complete' : 'Verification inconclusive'}
              </strong>
              <p>{comparison.reason}</p>
              <small>
                Recorded {dateTime(verification.createdAt)} · Scan{' '}
                {comparison.candidateId.slice(0, 8)}
              </small>
            </div>
            <div className="plan-metrics">
              <div>
                <strong>{counts('not-detected')}</strong>
                <span>no longer detected</span>
              </div>
              <div>
                <strong>{counts('persistent')}</strong>
                <span>still detected</span>
              </div>
              <div>
                <strong>{counts('new')}</strong>
                <span>new advisory groups</span>
              </div>
              <div>
                <strong>{counts('inconclusive')}</strong>
                <span>unresolved by coverage</span>
              </div>
            </div>
            <details className="package-diff">
              <summary>
                Package changes: {comparison.packages.changed.length} changed ·{' '}
                {comparison.packages.added.length} added · {comparison.packages.removed.length}{' '}
                removed
              </summary>
              <PagedList
                items={[
                  ...comparison.packages.changed,
                  ...comparison.packages.added.map((p) => `Added: ${p}`),
                  ...comparison.packages.removed.map((p) => `Removed: ${p}`),
                ]}
                label="Dependency changes"
                key={comparison.candidateId}
              >
                {(items) => (
                  <ul>
                    {items.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </PagedList>
            </details>
            <label className="field">
              Filter comparison
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                }}
              >
                <option value="all">All changes</option>
                <option value="not-detected">No longer detected</option>
                <option value="persistent">Still detected</option>
                <option value="new">New findings</option>
                <option value="inconclusive">Inconclusive</option>
              </select>
            </label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Package / advisory</th>
                    <th>Before → after</th>
                    <th>Evidence outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.items.map((c) => (
                    <tr key={`${c.package}:${c.advisory}`}>
                      <td>
                        <strong>{c.package}</strong>
                        <small className="cell-subtext">{c.advisory}</small>
                      </td>
                      <td>
                        {c.beforeVersions.join(', ') || '—'} →{' '}
                        {c.afterVersions.join(', ') || 'No match'}
                      </td>
                      <td>
                        <span
                          className={`tag ${c.state === 'not-detected' ? 'tag-green' : c.state === 'new' ? 'tag-amber' : ''}`}
                        >
                          {c.state === 'not-detected' ? 'No longer detected' : c.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} label="Comparison findings" />
            {plan.verifications.length > 1 && (
              <p className="muted">
                Showing the latest of {plan.verifications.length} recorded comparisons. All records
                are included in the plan export.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
