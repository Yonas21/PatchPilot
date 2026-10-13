import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../Pagination';
import { PagedList } from '../Pagination';
import type { ReleaseDecision } from '../../../shared/release';
import { dateTime } from '../../api';
export function DecisionView({ decision }: { decision: ReleaseDecision }) {
  const pagination = usePagination(decision.findings, 25, decision.id);
  const count = (outcome: string) => decision.findings.filter((f) => f.outcome === outcome).length;
  return (
    <section className="panel release-decision">
      <div
        className={`comparison-banner ${decision.outcome === 'blocked' ? 'incomplete' : 'complete'}`}
      >
        <p className="eyebrow">
          RECORDED DECISION ·{' '}
          {decision.purpose === 'candidate' ? 'CANDIDATE EXPERIMENT' : 'SOURCE EVIDENCE'}
        </p>
        <h2>
          {decision.outcome === 'blocked'
            ? 'Release criteria not met'
            : decision.outcome === 'meets-policy-with-exceptions'
              ? 'Criteria met with accepted exceptions'
              : 'Configured criteria met'}
        </h2>
        <p>
          As of {dateTime(decision.evaluatedAt)} · Scan {decision.scanId.slice(0, 8)}
        </p>
        <p>
          This historical decision is not a deployment approval or security certification.
          Re-evaluate before release, especially after evidence or exception expiry.
        </p>
        {decision.blockers.length > 0 && (
          <ul>
            {decision.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        <a
          className="button button-outline"
          href={`/api/release/decisions/${decision.id}/export`}
          download
        >
          Export release review
        </a>
      </div>
      <div className="plan-metrics">
        <div>
          <strong>{count('blocker')}</strong>
          <span>blocking matches</span>
        </div>
        <div>
          <strong>{count('excepted')}</strong>
          <span>accepted exceptions</span>
        </div>
        <div>
          <strong>{count('outside-policy')}</strong>
          <span>outside selected criteria</span>
        </div>
        <div>
          <strong>{decision.policy.maxAgeHours}h</strong>
          <span>maximum evidence age</span>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Package / advisory</th>
              <th>Severity</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((f) => (
              <tr key={f.key}>
                <td>
                  <strong>
                    {f.package}@{f.version}
                  </strong>
                  <small className="cell-subtext">
                    {f.advisory} · {f.development ? 'development' : 'runtime'}
                  </small>
                </td>
                <td>{f.severity}</td>
                <td>{f.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pagination={pagination} label="Decision findings" />
      {decision.exceptions.length > 0 && (
        <details>
          <summary>Exceptions applied to this decision</summary>
          <PagedList items={decision.exceptions} label="Applied exceptions" size={10}>
            {(pageItems) => (
              <ul>
                {pageItems.map((e) => (
                  <li key={e.id}>
                    {e.package}@{e.version} · {e.owner} · expires {dateTime(e.expiresAt)}
                    <p>{e.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </PagedList>
        </details>
      )}
    </section>
  );
}
