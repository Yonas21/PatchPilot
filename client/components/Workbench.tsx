import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Layers3, RefreshCw } from 'lucide-react';
import type { Dashboard } from '../../shared/types';
import { activeStatuses } from '../../shared/types';
import type { PlanSummary, ScanSummary } from '../../shared/workbench';
import { api, post, dateTime } from '../api';
import { Spinner } from './Shared';
import { GuidedLab } from './GuidedLab';
import { PlanDetail } from './PlanDetail';

interface WorkbenchData {
  plans: PlanSummary[];
  scans: ScanSummary[];
}
export function Workbench({
  data,
  refreshParent,
}: {
  data: Dashboard;
  refreshParent: () => Promise<void>;
}) {
  const [state, setState] = useState<WorkbenchData>({ plans: [], scans: [] });
  const [inventoryId, setInventoryId] = useState(data.inventories[0]?.id ?? '');
  const [planId, setPlanId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    setState(await api<WorkbenchData>('/workbench'));
    setLoaded(true);
  }, []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<WorkbenchData>('/workbench');
        if (alive) {
          setState(next);
          setLoaded(true);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
      if (alive) timer = setTimeout(poll, 4000);
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      await reload();
      await refreshParent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const latest = state.scans.find(
    (s) => s.inventoryId === inventoryId && s.purpose !== 'candidate',
  );
  const ready = latest?.status === 'completed' && latest.hasSnapshot && latest.findingCount > 0;
  const plans = state.plans.filter((p) => p.inventoryId === inventoryId);
  const selected = plans.find((p) => p.id === planId) ?? plans[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FROM ALERTS TO EVIDENCE OF CHANGE</p>
          <h1>Remediation workbench</h1>
          <p className="page-description">
            Choose a manageable change. Review the evidence. Verify what happened.
          </p>
        </div>
        <Layers3 size={30} />
      </div>
      <div className="workbench-journey">
        <span>01 · Baseline scan</span>
        <ArrowRight size={16} />
        <span>02 · Review & approve</span>
        <ArrowRight size={16} />
        <span>03 · Compare evidence</span>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <section className="panel workbench-start">
        <div>
          <h2>Start from an inventory</h2>
          <p>
            A plan groups advisory matches into package changes. The baseline stays unchanged as you
            evaluate candidates.
          </p>
        </div>
        <label className="field">
          Inventory
          <select
            disabled={busy}
            value={inventoryId}
            onChange={(e) => {
              setInventoryId(e.target.value);
              setPlanId('');
            }}
          >
            <option value="" disabled>
              Choose an inventory
            </option>
            {data.inventories.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <div className="workbench-actions">
          <button
            className="button button-primary"
            disabled={busy || !ready}
            onClick={() =>
              void run(async () => {
                const plan = await post<PlanSummary>('/workbench/plans', {
                  scanId: latest!.id,
                });
                setPlanId(plan.id);
              })
            }
          >
            Prepare plan
            <ArrowRight size={15} />
          </button>
          <button
            className="button button-outline"
            disabled={busy || !inventoryId || (!!latest && activeStatuses.includes(latest.status))}
            onClick={() => void run(() => post(`/inventories/${inventoryId}/scan`))}
          >
            <RefreshCw size={15} />
            Refresh source scan
          </button>
        </div>
        <p className="muted">
          {latest
            ? `Latest source: ${latest.status} · ${latest.scanned}/${latest.total} checked · ${dateTime(latest.createdAt)}`
            : 'No source scan yet.'}
          {latest && !latest.hasSnapshot
            ? ' · Run a new scan to capture dependency paths and a verification snapshot.'
            : ''}
        </p>
      </section>
      <GuidedLab
        plan={selected}
        latest={latest}
        isLab={data.inventories.some(
          (i) =>
            i.id === inventoryId &&
            i.source === 'demo' &&
            i.name === 'Remediation lab · synthetic demo',
        )}
        busy={busy}
        run={run}
        selectInventory={(id) => {
          setInventoryId(id);
          setPlanId('');
        }}
      />
      {!loaded ? (
        <Spinner label="Loading plans…" />
      ) : plans.length > 0 ? (
        <>
          <label className="field workbench-plan-select">
            Saved plan
            <select
              disabled={busy}
              value={selected?.id ?? ''}
              onChange={(e) => setPlanId(e.target.value)}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.approvedAt ? 'Approved' : 'Draft'} · {dateTime(p.createdAt)} · {p.steps.length}{' '}
                  package changes
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <PlanDetail
              key={selected.id}
              plan={selected}
              scans={state.scans}
              busy={busy}
              run={run}
            />
          )}
        </>
      ) : (
        <section className="panel workbench-empty">
          <h2>A reviewable decision, not another alert list</h2>
          <p>
            Complete a source scan, then prepare a plan to see dependency paths, grouped findings,
            and explicit verification criteria.
          </p>
        </section>
      )}
      {busy && (
        <div className="workbench-working" role="status">
          <Spinner label="Saving workflow changes…" />
        </div>
      )}
    </>
  );
}
