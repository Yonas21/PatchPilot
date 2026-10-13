import { useState } from 'react';

export function usePagination<T>(items: T[], initialSize = 25, scope = '') {
  const [state, setState] = useState({ page: 1, size: initialSize, scope });
  const size = state.size;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = state.scope === scope ? Math.min(state.page, pages) : 1;
  if (state.scope !== scope || state.page !== page) {
    setState({ page, size, scope });
  }
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size),
    start,
    page,
    pages,
    size,
    total: items.length,
    setPage: (next: number) => setState({ page: Math.max(1, Math.min(next, pages)), size, scope }),
    setSize: (next: number) => setState({ page: 1, size: next, scope }),
  };
}
