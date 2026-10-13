import { PagedList } from './Pagination';
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCheck,
  Clock3,
  Plus,
  Radar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { Dashboard, Finding, Scan } from '../../shared/types';
import { activeStatuses } from '../../shared/types';
import { timeAgo } from '../api';
import { Badge, Empty } from './Shared';
import type { View } from './Shell';

export interface FindingRow {
  finding: Finding;
  scan: Scan;
  inventoryName: string;
  stale?: boolean;
}

export function Overview({
  data,
  rows,
  onAdd,
  onDemo,
  onSelect,
  navigate,
  busy,
  onSettings,
}: {
  data: Dashboard;
  rows: FindingRow[];
  onAdd: () => void;
  onDemo: () => void;
  onSelect: (row: FindingRow) => void;
  navigate: (view: View) => void;
  busy: boolean;
  onSettings: () => void;
}) {
  const urgent = rows.filter((row) =>
    ['critical', 'high'].includes(row.finding.advisory.severity),
  ).length;
  const active = data.scans.filter((scan) => activeStatuses.includes(scan.status));
  const openTasks = data.tickets.filter((task) => task.status === 'open').length;
  const packageCount = data.inventories.reduce(
    (sum, inventory) => sum + inventory.packages.length,
    0,
  );
  const severities = ['critical', 'high', 'moderate', 'low', 'unknown'] as const;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR SECURITY WORKSPACE</p>
          <h1>A clearer path to safer dependencies.</h1>
          <p className="page-description">Know what needs attention. Give your team a plan.</p>
        </div>
        <span className="date-label">
          {new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
      <section className="hero-grid">
        <div className="hero-card">
          <div className="hero-copy">
            <span className="hero-tag">
              <Radar size={14} />
              DEPENDENCY INTELLIGENCE
            </span>
            <h2>
              {active.length
                ? 'Your analyst is on it.'
                : rows.length
                  ? 'Find the signal.\nTake the next step.'
                  : 'Less research.\nMore remediation.'}
            </h2>
            <p>
              {active.length
                ? 'Checking package versions against live advisories. Results appear as the scan completes.'
                : rows.length
                  ? `${urgent} high or critical findings are ready for review. Every recommendation starts with traceable evidence.`
                  : 'Connect an inventory to turn vulnerability alerts into clear, evidence-backed actions.'}
            </p>
            <button
              className="button button-cream"
              onClick={() => (rows.length ? navigate('findings') : onAdd())}
            >
              {rows.length ? 'Review triage queue' : 'Add your first inventory'}
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="radar-art" aria-hidden="true">
            <div className="radar-ring ring-one" />
            <div className="radar-ring ring-two" />
            <div className="radar-ring ring-three" />
            <div className="radar-axis horizontal" />
            <div className="radar-axis vertical" />
            <div className="radar-core">
              <ShieldCheck size={43} strokeWidth={1.4} />
            </div>
            <span className="radar-node node-one" />
            <span className="radar-node node-two" />
            <span className="radar-caption">MONITOR · UNDERSTAND · ACT</span>
          </div>
        </div>
        <div className="posture-card">
          <div className="section-label">
            <span>Finding distribution</span>
            <Radar size={17} />
          </div>
          <div className="posture-total">
            {rows.length}
            <span>tracked findings</span>
          </div>
          <div className="distribution-bar" aria-label={`${rows.length} total findings`}>
            {severities.map((severity) => {
              const count = rows.filter((row) => row.finding.advisory.severity === severity).length;
              return (
                count > 0 && (
                  <span key={severity} className={`fill-${severity}`} style={{ flex: count }} />
                )
              );
            })}
          </div>
          <div className="distribution-legend">
            {severities.map((severity) => (
              <div key={severity}>
                <span className={`legend-dot fill-${severity}`} />
                <span>{severity === 'unknown' ? 'Needs review' : severity}</span>
                <strong>
                  {rows.filter((row) => row.finding.advisory.severity === severity).length}
                </strong>
              </div>
            ))}
          </div>
          <p className="footnote">Published severity, not confirmed exploitability.</p>
        </div>
      </section>
      <section className="stats-grid" aria-label="Workspace metrics">
        {[
          {
            label: 'Package versions',
            value: packageCount,
            note: `Across ${data.inventories.length} ${data.inventories.length === 1 ? 'inventory' : 'inventories'}`,
            icon: Boxes,
          },
          {
            label: 'Needs attention',
            value: urgent,
            note: 'High + critical findings',
            icon: Radar,
          },
          {
            label: 'Open remediation',
            value: openTasks,
            note: 'Approved local tasks',
            icon: CheckCheck,
          },
          {
            label: 'Daily monitors',
            value: data.inventories.filter((item) => item.monitoring).length,
            note: 'While this app is running',
            icon: Clock3,
          },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-label">
              {stat.label}
              <stat.icon size={18} />
            </div>
            <strong>{stat.value}</strong>
            <small>{stat.note}</small>
          </div>
        ))}
      </section>
      <div className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>
                Priority queue <span className="count-pill">{rows.length}</span>
              </h2>
              <p>Your next best actions, ordered by source severity.</p>
            </div>
            <button className="text-button" onClick={() => navigate('findings')}>
              View all
              <ArrowUpRight size={16} />
            </button>
          </div>
          {rows.length ? (
            <PagedList items={rows} label="Priority findings" size={5}>
              {(pageItems) => (
                <div className="priority-list">
                  {pageItems.map((row) => (
                    <button
                      key={`${row.scan.id}:${row.finding.key}`}
                      className="priority-row"
                      onClick={() => onSelect(row)}
                    >
                      <div className="package-icon">
                        <Boxes size={18} />
                      </div>
                      <div className="priority-info">
                        <strong>
                          {row.finding.dependency.name}
                          <span>@{row.finding.dependency.version}</span>
                        </strong>
                        <small>
                          {row.stale ? 'Earlier evidence · ' : ''}
                          {row.finding.advisory.summary}
                        </small>
                      </div>
                      <Badge severity={row.finding.advisory.severity} />
                      <ArrowUpRight className="row-arrow" size={17} />
                    </button>
                  ))}
                </div>
              )}
            </PagedList>
          ) : (
            <Empty
              title="Your triage queue starts here"
              description="Import a lockfile, or explore with a synthetic inventory scanned against live OSV data."
              action={
                <button className="button button-outline" disabled={busy} onClick={onDemo}>
                  <Sparkles size={16} />
                  {busy ? 'Starting…' : 'Try the demo inventory'}
                </button>
              }
            />
          )}
        </section>
        <section className="panel activity-panel">
          <div className="panel-header">
            <div>
              <h2>Agent activity</h2>
              <p>A transparent trail of every action.</p>
            </div>
            <span className="status-dot" />
          </div>
          {data.activity.length ? (
            <PagedList items={data.activity} label="Recent activity" size={4}>
              {(pageItems) => (
                <div className="activity-list">
                  {pageItems.map((event) => (
                    <div className="activity-item" key={event.id}>
                      <span className={`activity-symbol ${event.kind}`}>
                        <CheckCheck size={14} />
                      </span>
                      <div>
                        <strong>{event.title}</strong>
                        <p>{event.detail}</p>
                        <time>{timeAgo(event.createdAt)}</time>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PagedList>
          ) : (
            <div className="quiet-state">
              <Clock3 size={24} />
              <p>Ready when you are.</p>
              <span>Your scans and actions will appear here.</span>
            </div>
          )}
          <button className="panel-footer-button" onClick={() => navigate('activity')}>
            Open activity log
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <section className="integration-strip">
        <div className="inline">
          <Sparkles size={20} />
          <div>
            <strong>Built on evidence. Powered by AI.</strong>
            <p>OSV advisories + public GitHub imports + Gemini reasoning.</p>
          </div>
        </div>
        <button className="text-button" onClick={onSettings}>
          {data.integrations.gemini ? 'Manage integrations' : 'Connect Gemini'}
          <ArrowRight size={16} />
        </button>
      </section>
      {!data.inventories.length && (
        <button className="sr-only" onClick={onAdd}>
          <Plus size={14} />
          Add inventory
        </button>
      )}
    </>
  );
}
