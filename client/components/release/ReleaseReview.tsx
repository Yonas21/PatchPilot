import { PagedList } from '../Pagination';
import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Dashboard } from '../../../shared/types';
import { activeStatuses } from '../../../shared/types';
import {
  defaultPolicy,
  type ReleasePolicy,
  type RiskException,
  type ReleaseDecision,
  type ReleaseFinding,
} from '../../../shared/release';
import type { ScanSummary } from '../../../shared/workbench';
import { api, post, dateTime } from '../../api';
import { Spinner } from '../Shared';
import { PolicyForm } from './PolicyForm';
import { ExceptionForm } from './ExceptionForm';
import { DecisionView } from './DecisionView';
interface State {
  policies: ReleasePolicy[];
  exceptions: RiskException[];
  decisions: Omit<ReleaseDecision, 'findings'>[];
}
export function ReleaseReview({ data }: { data: Dashboard }) {
  const [inventoryId, setInventoryId] = useState(data.inventories[0]?.id ?? '');
  const [scanId, setScanId] = useState('');
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [state, setState] = useState<State>({ policies: [], exceptions: [], decisions: [] });
  const [findings, setFindings] = useState<Omit<ReleaseFinding, 'outcome'>[]>([]);
  const [decision, setDecision] = useState<ReleaseDecision | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const reload = useCallback(async () => {
    const [next, workbench] = await Promise.all([
      api<State>('/release/state'),
      api<{ scans: ScanSummary[] }>('/workbench'),
    ]);
    setState(next);
    setScans(workbench.scans);
  }, []);
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, [reload]);
  const candidates = scans.filter((s) => s.inventoryId === inventoryId);
  const selected =
    candidates.find((s) => s.id === scanId) ??
    candidates.find((s) => s.purpose !== 'candidate') ??
    candidates[0];
  useEffect(() => {
    setFindings([]);
    setDecision(null);
    if (!selected) return;
    let active = true;
    void api<{ findings: Omit<ReleaseFinding, 'outcome'>[] }>(`/release/scans/${selected.id}`)
      .then((r) => {
        if (active) setFindings(r.findings);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected?.id, selected?.status, selected?.findingCount]);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const policy = state.policies.find((p) => p.id === inventoryId) ?? {
    id: inventoryId,
    ...defaultPolicy,
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">AN EXPLICIT ENGINEERING DECISION</p>
          <h1>Release review</h1>
          <p className="page-description">
            Set criteria, keep accepted risk visible, and record the evidence behind your decision.
          </p>
        </div>
        <ShieldCheck size={30} />
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <section className="panel release-select">
        <div className="release-columns">
          <label className="field">
            Review inventory
            <select
              disabled={busy}
              value={inventoryId}
              onChange={(e) => {
                setInventoryId(e.target.value);
                setScanId('');
              }}
            >
              <option value="" disabled>
                Select an inventory
              </option>
              {data.inventories.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Evidence scan
            <select
              disabled={busy}
              value={selected?.id ?? ''}
              onChange={(e) => setScanId(e.target.value)}
            >
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.purpose === 'candidate' ? 'Candidate experiment' : 'Source scan'} ·{' '}
                  {dateTime(s.createdAt)} · {s.status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="text-button" disabled={busy} onClick={() => void run(async () => {})}>
          Refresh available scans
        </button>
        <p className="muted">
          Candidate reviews apply only to the uploaded snapshot. This app does not verify deployment
          or application tests.
        </p>
      </section>
      {inventoryId && (
        <PolicyForm
          key={JSON.stringify(policy)}
          policy={policy}
          busy={busy}
          onSave={(p) =>
            run(async () => {
              await api(`/release/policies/${inventoryId}`, {
                method: 'PUT',
                body: JSON.stringify(p),
              });
              setDecision(null);
            })
          }
        />
      )}
      {selected && (
        <>
          <div className="release-evaluate">
            <button
              className="button button-primary"
              disabled={busy || activeStatuses.includes(selected.status)}
              onClick={() =>
                void run(async () => {
                  setDecision(
                    await post<ReleaseDecision>('/release/decisions', { scanId: selected.id }),
                  );
                })
              }
            >
              {busy ? <Spinner label="Working…" /> : 'Evaluate & record decision'}
            </button>
            <span>Evidence is checked against the saved criteria and active exceptions.</span>
          </div>
          {decision && <DecisionView key={decision.id} decision={decision} />}
          <ExceptionForm
            key={selected.id}
            scanId={selected.id}
            findings={findings}
            exceptions={state.exceptions.filter((e) => e.inventoryId === inventoryId)}
            busy={busy}
            run={(work) =>
              run(async () => {
                await work();
                setDecision(null);
              })
            }
          />
          <section className="panel release-history">
            <h2>Decision history</h2>
            <p>
              Historical records preserve the criteria and exceptions used at the time. They do not
              update when risk changes.
            </p>
            <PagedList
              items={state.decisions.filter((d) => d.inventoryId === inventoryId)}
              label="Release decisions"
              key={inventoryId}
            >
              {(items) => (
                <>
                  {items.map((d) => (
                    <button
                      key={d.id}
                      className="release-history-item"
                      disabled={busy}
                      onClick={() =>
                        void run(async () =>
                          setDecision(await api<ReleaseDecision>(`/release/decisions/${d.id}`)),
                        )
                      }
                    >
                      <span>
                        {d.outcome} ·{' '}
                        {d.purpose === 'candidate' ? 'candidate experiment' : 'source scan'}
                      </span>
                      <small>{dateTime(d.evaluatedAt)}</small>
                    </button>
                  ))}
                </>
              )}
            </PagedList>
          </section>
        </>
      )}
    </>
  );
}
