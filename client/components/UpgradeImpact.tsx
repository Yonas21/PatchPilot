import { PagedList } from './Pagination';
import { useEffect, useState } from 'react';
import type { UpgradeImpact as Impact } from '../../shared/upgrade-impact';
import { api } from '../api';

export function UpgradeImpact({ planId }: { planId: string }) {
  const [report, setReport] = useState<Impact>();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setReport(undefined);
    setSelected([]);
    setError('');
    void api<Impact>(`/workbench/plans/${planId}/impact`).then(
      (result) => {
        if (alive) setReport(result);
      },
      (e: Error) => {
        if (alive) setError(e.message);
      },
    );
    return () => {
      alive = false;
    };
  }, [planId]);
  const covered = new Set(
    report?.owners.filter((o) => selected.includes(o.location)).flatMap((o) => o.findingKeys),
  );
  return (
    <section className="panel workbench-lab" aria-label="Upgrade impact analysis">
      <p className="eyebrow">PLAN THE INVESTIGATION</p>
      <h2>Upgrade impact analysis</h2>
      <p>
        Select direct dependencies to see which baseline findings fall within their dependency
        trees. Shared findings count once.
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {!report && !error && <p role="status">Loading dependency ownership…</p>}
      {report && (
        <>
          <p>
            <strong>
              {covered.size} of {report.totalFindings}
            </strong>{' '}
            findings in selected trees · <strong>{report.totalFindings - covered.size}</strong>{' '}
            outside this investigation.
          </p>
          <PagedList items={report.owners} label="Dependency owners" size={10} key={planId}>
            {(pageItems) => (
              <>
                {pageItems.map((owner) => (
                  <details key={owner.location} className="impact-owner">
                    <summary>
                      {owner.package}@{owner.version} · {owner.findingKeys.length} findings
                    </summary>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(owner.location)}
                        onChange={(e) =>
                          setSelected((current) =>
                            e.target.checked
                              ? [...current, owner.location]
                              : current.filter((id) => id !== owner.location),
                          )
                        }
                      />{' '}
                      Include {owner.package} in investigation
                    </label>
                    <p>{owner.affectedPackages.join(', ')}</p>
                    <small>
                      {owner.sharedFindingCount} findings also occur under other direct
                      dependencies. Location: {owner.location}
                    </small>
                  </details>
                ))}
              </>
            )}
          </PagedList>
          <p className="muted">
            {report.unownedFindingKeys.length} findings have no confirmed owner.{' '}
            {report.unresolvedEdges} unresolved graph edges.{' '}
            {!report.graphAvailable && 'Root declarations are unavailable.'}
          </p>
          <p className="muted">
            This is installation ownership, not runtime reachability or a prediction that a parent
            upgrade fixes its children. Check candidate evidence and compare the regenerated
            lockfile to establish what remains.
          </p>
        </>
      )}
    </section>
  );
}
