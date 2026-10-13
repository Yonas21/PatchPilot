import {
  Activity,
  ArrowUpRight,
  Boxes,
  CircleCheck,
  LayoutDashboard,
  ListChecks,
  PanelLeftClose,
  Plus,
  Radar,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { Dashboard } from '../../shared/types';
import type { ReactNode } from 'react';

export type View = 'overview' | 'findings' | 'inventories' | 'tasks' | 'activity';
const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'findings', label: 'Triage queue', icon: Radar },
  { id: 'inventories', label: 'Inventories', icon: Boxes },
  { id: 'tasks', label: 'Remediation', icon: ListChecks },
  { id: 'activity', label: 'Activity log', icon: Activity },
] as const;

export function Shell({
  view,
  navigate,
  children,
  data,
  onAdd,
  onSettings,
  findingCount,
}: {
  view: View;
  navigate: (view: View) => void;
  children: ReactNode;
  data: Dashboard | null;
  onAdd: () => void;
  onSettings: () => void;
  findingCount: number;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="#overview" className="brand" aria-label="PatchPilot home">
          <span className="brand-mark">
            <ShieldCheck size={26} />
          </span>
          PatchPilot<span className="brand-dot">.</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">L</span>
          <span>
            Local workspace<small>Personal environment</small>
          </span>
          <PanelLeftClose size={16} />
        </div>
        <p className="nav-heading">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`nav-link ${view === item.id ? 'active' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(item.id);
              }}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'findings' && findingCount > 0 && (
                <span className="nav-count">{findingCount}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-card">
            <Sparkles size={19} />
            <strong>Your AI analyst</strong>
            <p>
              {data?.integrations.gemini
                ? 'Gemini is configured. Your highest-priority finding gets an automatic brief.'
                : 'Connect Gemini to turn advisory evidence into actionable briefs.'}
            </p>
            <button onClick={onSettings}>
              {data?.integrations.gemini ? 'Integration settings' : 'Connect Gemini'}
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="local-status">
            <span className="status-dot" />
            Running on your machine
            <CircleCheck size={14} />
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            <strong>{navigation.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-badge">
              <span className="status-dot" />
              Local edition
            </span>
            <button className="button button-dark" onClick={onAdd}>
              <Plus size={17} />
              New inventory
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Evidence first. Human approved.</span>
          <span>PatchPilot / Local workspace</span>
        </footer>
      </div>
    </div>
  );
}
