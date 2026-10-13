import { Pagination } from './Pagination';
import { usePagination } from '../hooks/usePagination';
import { useState } from 'react';
import { ArrowUpRight, Boxes, Filter, Sparkles } from 'lucide-react';
import type { Inventory } from '../../shared/types';
import type { FindingRow } from './Overview';
import { Badge, Empty, SearchBox } from './Shared';

export function Findings({
  rows,
  inventories,
  onSelect,
  onAdd,
}: {
  rows: FindingRow[];
  inventories: Pick<Inventory, 'id' | 'name'>[];
  onSelect: (row: FindingRow) => void;
  onAdd: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [inventoryId, setInventoryId] = useState('all');
  const projects = [...inventories].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const query = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (inventoryId === 'all' || row.scan.inventoryId === inventoryId) &&
      (filter === 'all' || row.finding.advisory.severity === filter) &&
      `${row.finding.dependency.name} ${row.finding.advisory.id} ${row.finding.advisory.summary} ${row.inventoryName}`
        .toLowerCase()
        .includes(query),
  );
  const pagination = usePagination(filtered, 25, JSON.stringify([search, filter, inventoryId]));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">UNDERSTAND THE SIGNAL</p>
          <h1>Triage queue</h1>
          <p className="page-description">
            Source evidence, clear priorities, and a practical next step.
          </p>
        </div>
        <span className="large-count">
          {rows.length}
          <small>findings</small>
        </span>
      </div>
      <section className="panel">
        <div className="toolbar triage-toolbar">
          <SearchBox
            value={search}
            onChange={(value) => {
              setSearch(value);
            }}
            placeholder="Search packages, advisories, inventories…"
          />
          <label className="filter-select triage-project-filter">
            <span className="sr-only">Filter by inventory or project</span>
            <select
              value={inventoryId}
              onChange={(event) => {
                setInventoryId(event.target.value);
              }}
            >
              <option value="all">All inventories / projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {projects.some((other) => other.id !== project.id && other.name === project.name)
                    ? ` (${project.id.slice(0, 8)})`
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <Filter size={16} />
            <span className="sr-only">Filter by severity</span>
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="moderate">Moderate</option>
              <option value="low">Low</option>
              <option value="unknown">Needs review</option>
            </select>
          </label>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Package / advisory</th>
                  <th>Severity</th>
                  <th>Inventory</th>
                  <th>Analysis</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map((row) => (
                  <tr key={`${row.scan.id}:${row.finding.key}`}>
                    <td>
                      <button className="table-package" onClick={() => onSelect(row)}>
                        <Boxes size={19} />
                        <span>
                          <strong>
                            {row.finding.dependency.name}
                            <small>@{row.finding.dependency.version}</small>
                          </strong>
                          <span>{row.finding.advisory.summary}</span>
                          <code>{row.finding.advisory.id}</code>
                        </span>
                      </button>
                    </td>
                    <td>
                      <Badge severity={row.finding.advisory.severity} />
                    </td>
                    <td>
                      <span className="inventory-name">{row.inventoryName}</span>
                      <small className="cell-subtext">
                        {row.finding.dependency.dev ? 'Development' : 'Runtime'}
                      </small>
                      {row.stale && <span className="tag tag-amber">Earlier evidence</span>}
                    </td>
                    <td>
                      <span className={`analysis-status ${row.finding.brief ? 'ready' : ''}`}>
                        {row.finding.brief && <Sparkles size={13} />}
                        {row.finding.brief
                          ? 'Brief ready'
                          : row.finding.briefError
                            ? 'Needs retry'
                            : 'Evidence ready'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Review ${row.finding.dependency.name} ${row.finding.advisory.id}`}
                        onClick={() => onSelect(row)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={rows.length ? 'No matching findings' : 'No findings to review'}
            description={
              rows.length
                ? 'Try another search, inventory, or severity filter.'
                : 'Add an inventory and complete a scan to see its published vulnerability matches.'
            }
            action={
              !rows.length && (
                <button className="button button-primary" onClick={onAdd}>
                  Add inventory
                </button>
              )
            }
          />
        )}
        <Pagination pagination={pagination} label="Findings" sizes={[25, 50, 100]} />
        <div className="table-footer">
          {filtered.length} matching of {rows.length} total findings. Latest available results per
          inventory. Incomplete coverage is flagged above.
        </div>
      </section>
    </>
  );
}
