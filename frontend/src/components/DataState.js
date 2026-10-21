import Icon from './Icon';

export function TableSkeleton({ columns = 5, rows = 6 }) {
  return (
    <div className="table-skeleton" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skeleton-row" key={r} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((__, c) => <span className="skeleton" key={c} />)}
        </div>
      ))}
    </div>
  );
}

export function EmptyInline({ children }) {
  return <p className="empty-inline">{children}</p>;
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <Icon name="alert" size={22} />
      <div>
        <h3>Could not load data</h3>
        <p>{error?.message || 'Something went wrong.'}</p>
      </div>
      {onRetry && <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

// Status marker: a glyph plus text, so state never relies on colour alone.
// tone: ok | late | done | off | key
export function Status({ tone, children }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

export function Pagination({ pagination, onPage }) {
  if (!pagination) return null;
  const { page, pageSize, total } = pagination;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-summary">{from}–{to} of {total}</span>
      <div className="pagination-controls">
        <button type="button" className="icon-button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <Icon name="chevronLeft" />
        </button>
        <span>Page {page} of {pages}</span>
        <button type="button" className="icon-button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <Icon name="chevronRight" />
        </button>
      </div>
    </nav>
  );
}

export function SearchInput({ value, onChange, label, placeholder }) {
  return (
    <div className="search-input">
      <Icon name="search" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
      />
    </div>
  );
}
