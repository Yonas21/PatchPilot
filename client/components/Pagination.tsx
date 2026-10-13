import type { ReactNode } from 'react';
import { usePagination } from '../hooks/usePagination';

type PageState = Omit<ReturnType<typeof usePagination>, 'items'>;
export function Pagination({
  pagination: p,
  label,
  sizes = [10, 25, 50, 100],
}: {
  pagination: PageState;
  label: string;
  sizes?: number[];
}) {
  const options = [...new Set([...sizes, p.size])].sort((a, b) => a - b);
  return (
    <div className="table-footer triage-pagination">
      <p role="status">
        {p.total ? `${p.start + 1}–${Math.min(p.start + p.size, p.total)} of ${p.total}` : '0'}{' '}
        {label}
      </p>
      <label className="filter-select">
        Per page
        <select
          aria-label={`${label} per page`}
          value={p.size}
          onChange={(e) => p.setSize(Number(e.target.value))}
        >
          {options.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <nav aria-label={`${label} pagination`} className="triage-page-controls">
        <button
          className="button button-outline"
          disabled={p.page === 1}
          onClick={() => p.setPage(1)}
        >
          First
        </button>
        <button
          className="button button-outline"
          disabled={p.page === 1}
          onClick={() => p.setPage(p.page - 1)}
        >
          Previous
        </button>
        <span>
          Page {p.page} of {p.pages}
        </span>
        <button
          className="button button-outline"
          disabled={p.page === p.pages}
          onClick={() => p.setPage(p.page + 1)}
        >
          Next
        </button>
        <button
          className="button button-outline"
          disabled={p.page === p.pages}
          onClick={() => p.setPage(p.pages)}
        >
          Last
        </button>
      </nav>
    </div>
  );
}

export function PagedList<T>({
  items,
  label,
  size = 10,
  children,
}: {
  items: T[];
  label: string;
  size?: number;
  children: (items: T[], start: number) => ReactNode;
}) {
  const pagination = usePagination(items, size);
  return (
    <>
      {children(pagination.items, pagination.start)}
      <Pagination pagination={pagination} label={label} />
    </>
  );
}
