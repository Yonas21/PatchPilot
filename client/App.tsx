import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { activeStatuses, severityOrder, type Dashboard } from '../shared/types';
import { api, post } from './api';
import { selectInventoryFindings } from '../shared/scan-selection';
import { Shell, type View } from './components/Shell';
import { Overview, type FindingRow } from './components/Overview';
import { InventoryForm } from './components/InventoryForm';
import { FindingDetail } from './components/FindingDetail';
import { Findings } from './components/Findings';
import { ActivityLog } from './components/ActivityLog';
import { Inventories } from './components/Inventories';
import { Settings } from './components/Settings';
import { Tasks } from './components/Tasks';
import { Modal, Spinner } from './components/Shared';

const views: View[] = ['overview', 'findings', 'inventories', 'tasks', 'activity'];
function hashView(): View {
  const value = window.location.hash.slice(1) as View;
  return views.includes(value) ? value : 'overview';
}

export function App() {
  const [view, setView] = useState<View>(hashView);
  const [data, setData] = useState<Dashboard | null>(null);
  const [add, setAdd] = useState(false);
  const [settings, setSettings] = useState(false);
  const [selection, setSelection] = useState<{ scanId: string; key: string } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const result = await api<Dashboard>('/dashboard');
    setData(result);
    setConnectionError('');
  }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<Dashboard>('/dashboard');
        if (active) {
          setData(result);
          setConnectionError('');
        }
      } catch (error) {
        if (active) setConnectionError((error as Error).message);
      }
      if (active) timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const listener = () => setView(hashView());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function navigate(next: View) {
    window.location.hash = next;
    setView(next);
  }
  const rows = useMemo(() => {
    if (!data) return [];
    const result: FindingRow[] = [];
    for (const inventory of data.inventories) {
      result.push(
        ...selectInventoryFindings(data.scans, inventory.id).map((row) => ({
          ...row,
          inventoryName: inventory.name,
        })),
      );
    }
    return result.sort(
      (a, b) =>
        severityOrder[a.finding.advisory.severity] - severityOrder[b.finding.advisory.severity] ||
        Number(a.finding.dependency.dev) - Number(b.finding.dependency.dev) ||
        a.finding.advisory.id.localeCompare(b.finding.advisory.id),
    );
  }, [data]);
  async function run(work: () => Promise<unknown>, message = '') {
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
      if (message) setNotice(message);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedScan = data?.scans.find((scan) => scan.id === selection?.scanId);
  const selectedFinding = selectedScan?.findings.find((finding) => finding.key === selection?.key);
  const selectedRow =
    selectedScan && selectedFinding
      ? {
          scan: selectedScan,
          finding: selectedFinding,
          stale: rows.find(
            (row) => row.scan.id === selectedScan.id && row.finding.key === selectedFinding.key,
          )?.stale,
          inventoryName:
            data?.inventories.find((inventory) => inventory.id === selectedScan.inventoryId)
              ?.name ?? '',
        }
      : null;
  const task = data?.tickets.find((ticket) => ticket.id === taskId);
  const running = data?.scans.filter((scan) => activeStatuses.includes(scan.status)) ?? [];
  const latestFailures =
    data?.inventories.flatMap((inventory) => {
      const latest = data.scans.find((scan) => scan.inventoryId === inventory.id);
      return latest && ['failed', 'partial'].includes(latest.status)
        ? [`${inventory.name}: ${latest.status} (${latest.scanned}/${latest.total} checked)`]
        : [];
    }) ?? [];
  function select(row: FindingRow) {
    setSelection({ scanId: row.scan.id, key: row.finding.key });
  }
  return (
    <Shell
      view={view}
      navigate={navigate}
      data={data}
      onAdd={() => setAdd(true)}
      onSettings={() => setSettings(true)}
      findingCount={rows.length}
    >
      {(error || connectionError) && (
        <div className="error-banner global-banner" role="alert">
          <AlertTriangle size={18} />
          <span>
            {connectionError
              ? `Connection interrupted. Displayed data may be stale. ${connectionError}`
              : error}
          </span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => {
              setError('');
              setConnectionError('');
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {running.length > 0 && (
        <div className="scan-progress" role="status">
          <LoaderCircle className="spin" size={17} />
          <span>
            {running.length === 1
              ? `${data?.inventories.find((item) => item.id === running[0].inventoryId)?.name}: ${running[0].status} · ${running[0].scanned}/${running[0].total} packages checked`
              : `${running.length} scans in progress`}
          </span>
          <span>You can keep exploring.</span>
        </div>
      )}
      {latestFailures.length > 0 && (
        <div className="coverage-warning">
          <AlertTriangle size={17} />
          <div>
            <strong>Some inventories have incomplete scan coverage.</strong>
            <p>{latestFailures.join(' · ')}. Any earlier findings remain available.</p>
          </div>
          <button className="text-button" onClick={() => navigate('inventories')}>
            Inspect
          </button>
        </div>
      )}
      {!data ? (
        <div className="loading-screen">
          <Spinner label="Opening your workspace…" />
        </div>
      ) : (
        <>
          {view === 'overview' && (
            <Overview
              data={data}
              rows={rows}
              onAdd={() => setAdd(true)}
              onDemo={() =>
                void run(
                  () =>
                    post('/inventories', {
                      name: 'Northstar API · demo',
                      source: 'demo',
                      context:
                        'Synthetic demo of a public Node.js SaaS API using JWT authentication and JSON requests.',
                    }),
                  'Demo inventory added; live scan started',
                )
              }
              onSelect={select}
              navigate={navigate}
              busy={busy}
              onSettings={() => setSettings(true)}
            />
          )}
          {view === 'findings' && (
            <Findings rows={rows} onSelect={select} onAdd={() => setAdd(true)} />
          )}
          {view === 'inventories' && (
            <Inventories data={data} onAdd={() => setAdd(true)} run={run} busy={busy} />
          )}
          {view === 'tasks' && <Tasks data={data} run={run} busy={busy} onInspect={setTaskId} />}
          {view === 'activity' && <ActivityLog data={data} />}
          {settings && <Settings data={data} onClose={() => setSettings(false)} />}
          {selectedRow && (
            <FindingDetail
              key={`${selectedRow.scan.id}:${selectedRow.finding.key}`}
              row={selectedRow}
              gemini={data.integrations.gemini}
              ticket={data.tickets.find(
                (ticket) =>
                  ticket.inventoryId === selectedRow.scan.inventoryId &&
                  ticket.findingKey === selectedRow.finding.key,
              )}
              onClose={() => setSelection(null)}
              refresh={refresh}
            />
          )}
          {task && (
            <Modal
              wide
              title="Approved remediation task"
              subtitle={task.title}
              onClose={() => setTaskId(null)}
            >
              <pre className="task-preview">{task.body}</pre>
              <div className="modal-actions">
                <a
                  className="button button-primary"
                  href={`/api/tickets/${task.id}/export`}
                  download
                >
                  Download Markdown
                </a>
              </div>
            </Modal>
          )}
        </>
      )}
      {add && (
        <InventoryForm
          onClose={() => setAdd(false)}
          onCreated={async () => {
            await refresh();
            navigate('inventories');
            setNotice('Inventory added; scan started');
          }}
        />
      )}
    </Shell>
  );
}
