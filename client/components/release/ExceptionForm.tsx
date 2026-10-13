import { PagedList } from '../Pagination';
import { useState } from 'react';
import type { ReleaseFinding, RiskException } from '../../../shared/release';
import { dateTime, post } from '../../api';

export function ExceptionForm({
  scanId,
  findings,
  exceptions,
  busy,
  run,
}: {
  scanId: string;
  findings: Omit<ReleaseFinding, 'outcome'>[];
  exceptions: RiskException[];
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [findingKey, setFindingKey] = useState(''),
    [owner, setOwner] = useState(''),
    [reason, setReason] = useState(''),
    [days, setDays] = useState(7),
    [approved, setApproved] = useState(false);
  const selected = findings.find((f) => f.key === findingKey) ?? findings[0];
  return (
    <details className="panel release-exceptions">
      <summary>
        Time-limited risk exceptions (
        {exceptions.filter((e) => !e.revokedAt && Date.parse(e.expiresAt) > Date.now()).length}{' '}
        active)
      </summary>
      <p>
        Keep accepted risk visible. An exception covers one finding/version in this inventory,
        expires automatically, and never changes scan evidence. Owner is a recorded label, not an
        authenticated signature.
      </p>
      {findings.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await post('/release/exceptions', {
                scanId,
                findingKey: selected.key,
                owner,
                reason,
                approved,
                expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
              });
              setApproved(false);
            });
          }}
        >
          <label className="field">
            Finding to except
            <select value={selected?.key ?? ''} onChange={(e) => setFindingKey(e.target.value)}>
              {findings.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.package}@{f.version} · {f.advisory} · {f.severity}
                </option>
              ))}
            </select>
          </label>
          <div className="release-columns">
            <label className="field">
              Review owner
              <input
                required
                minLength={2}
                maxLength={100}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </label>
            <label className="field">
              Expires in days
              <input
                type="number"
                required
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            Reason and compensating controls
            <textarea
              required
              minLength={20}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this temporary exception is acceptable and who will revisit it."
            />
          </label>
          <label className="release-checkbox">
            <input
              type="checkbox"
              required
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            I approve this temporary exception for the selected finding.
          </label>
          <button className="button button-outline" disabled={busy || !approved}>
            Approve exception
          </button>
        </form>
      )}
      <div className="exception-records">
        <PagedList items={exceptions} label="Risk exceptions">
          {(items) => (
            <>
              {items.map((e) => (
                <article key={e.id}>
                  <div>
                    <strong>
                      {e.package}@{e.version} · {e.advisoryId}
                    </strong>
                    <p>{e.reason}</p>
                    <small>
                      {e.owner} ·{' '}
                      {e.revokedAt
                        ? 'Revoked'
                        : Date.parse(e.expiresAt) <= Date.now()
                          ? 'Expired'
                          : 'Active'}{' '}
                      · expires {dateTime(e.expiresAt)}
                    </small>
                  </div>
                  {!e.revokedAt && Date.parse(e.expiresAt) > Date.now() && (
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => void run(() => post(`/release/exceptions/${e.id}/revoke`))}
                    >
                      Revoke
                    </button>
                  )}
                </article>
              ))}
            </>
          )}
        </PagedList>
      </div>
    </details>
  );
}
