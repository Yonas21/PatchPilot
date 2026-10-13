import { ArrowUpRight, Boxes, Clock3, Github, Plus, RefreshCw } from 'lucide-react';
import type { Dashboard } from '../../shared/types';
import { activeStatuses } from '../../shared/types';
import { dateTime, patch, post, type RunAction } from '../api';
import { Empty, ExternalLink } from './Shared';

export function Inventories({
  data,
  onAdd,
  run,
  busy,
}: {
  data: Dashboard;
  onAdd: () => void;
  run: RunAction;
  busy: boolean;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KEEP YOUR DEPENDENCIES IN SIGHT</p>
          <h1>Inventories</h1>
          <p className="page-description">
            Exact versions, visible coverage, and a daily watch when you need it.
          </p>
        </div>
        <button className="button button-primary" onClick={onAdd}>
          <Plus size={17} />
          Add inventory
        </button>
      </div>
      {!data.inventories.length ? (
        <section className="panel">
          <Empty
            title="Start with what you ship"
            description="Import a public GitHub lockfile, upload your own, or explore the demo."
            action={
              <button className="button button-primary" onClick={onAdd}>
                Add inventory
              </button>
            }
          />
        </section>
      ) : (
        <div className="inventory-grid">
          {data.inventories.map((inventory) => {
            const latest = data.scans.find((scan) => scan.inventoryId === inventory.id);
            const active = latest && activeStatuses.includes(latest.status);
            return (
              <section className="panel inventory-card" key={inventory.id}>
                <div className="inventory-card-heading">
                  <span className="inventory-icon">
                    {inventory.source === 'github' ? <Github size={25} /> : <Boxes size={25} />}
                  </span>
                  <span className={`tag ${inventory.source === 'demo' ? 'tag-amber' : ''}`}>
                    {inventory.source === 'demo'
                      ? 'Synthetic demo'
                      : inventory.source === 'github'
                        ? 'Public GitHub'
                        : 'Uploaded lockfile'}
                  </span>
                </div>
                <h2>{inventory.name}</h2>
                <p className="inventory-context">
                  {inventory.context || 'No application context provided.'}
                </p>
                <div className="inventory-metrics">
                  <div>
                    <strong>{inventory.packages.length}</strong>
                    <small>package versions</small>
                  </div>
                  <div>
                    <strong>{latest?.findings.length ?? '—'}</strong>
                    <small>latest findings</small>
                  </div>
                  <div>
                    <strong>{inventory.skipped.length}</strong>
                    <small>skipped entries</small>
                  </div>
                </div>
                {inventory.repository && (
                  <div className="repo-info">
                    <ExternalLink
                      href={`https://github.com/${inventory.repository.owner}/${inventory.repository.repo}`}
                    >
                      {inventory.repository.owner}/{inventory.repository.repo}
                    </ExternalLink>
                    <code>
                      {inventory.repository.sha?.slice(0, 8)} · {inventory.repository.path}
                    </code>
                  </div>
                )}
                <div className="inventory-status">
                  <span>Latest scan</span>
                  <strong className={latest?.status === 'failed' ? 'error-text' : ''}>
                    {latest
                      ? `${latest.status} · ${latest.scanned}/${latest.total} checked`
                      : 'Not scanned'}
                  </strong>
                </div>
                {latest?.errors.length ? (
                  <div className="error-banner">
                    <strong>Scan needs attention</strong>
                    <p>{latest.errors[0]}</p>
                  </div>
                ) : null}
                {inventory.skipped.length > 0 && (
                  <details className="skipped-details">
                    <summary>{inventory.skipped.length} entries excluded from coverage</summary>
                    <ul>
                      {inventory.skipped.slice(0, 20).map((entry, index) => (
                        <li key={index}>
                          <code>{entry.location}</code>: {entry.reason}
                        </li>
                      ))}
                    </ul>
                    {inventory.skipped.length > 20 && <p>Showing the first 20 excluded entries.</p>}
                  </details>
                )}
                <div className="monitor-line">
                  <Clock3 size={17} />
                  <div>
                    <strong>
                      {inventory.monitoring ? 'Daily monitoring is on' : 'Daily monitoring is off'}
                    </strong>
                    <small>
                      {inventory.monitoring
                        ? `Next: ${dateTime(inventory.nextRunAt)}`
                        : 'Checks run while the local app is open.'}
                    </small>
                  </div>
                  <button
                    className={`toggle ${inventory.monitoring ? 'on' : ''}`}
                    role="switch"
                    aria-checked={inventory.monitoring}
                    aria-label={`Daily monitoring for ${inventory.name}`}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          patch(`/inventories/${inventory.id}/monitor`, {
                            enabled: !inventory.monitoring,
                          }),
                        'Monitoring updated',
                      )
                    }
                  >
                    <span />
                  </button>
                </div>
                <div className="inventory-actions">
                  <span className="footnote">
                    {latest ? dateTime(latest.createdAt) : 'Ready to scan'}
                  </span>
                  <button
                    className="button button-outline"
                    disabled={busy || !!active}
                    onClick={() =>
                      void run(() => post(`/inventories/${inventory.id}/scan`), 'Scan started')
                    }
                  >
                    <RefreshCw size={15} className={active ? 'spin' : ''} />
                    {active ? 'Scanning…' : 'Scan now'}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
      {data.inventories.some((item) => item.monitoring) && (
        <div className="integration-strip">
          <div className="inline">
            <Clock3 size={20} />
            <p>
              The worker checks schedules every minute. Uploaded inventories track new advisories;
              GitHub imports also refresh the lockfile.
            </p>
          </div>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void run(() => post('/monitor/check'), 'Due schedules checked')}
          >
            Check due schedules
            <ArrowUpRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}
