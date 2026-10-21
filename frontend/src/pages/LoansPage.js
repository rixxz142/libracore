import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, toQuery } from '../services/api';
import { useDebounced, useResource } from '../services/useResource';
import { addDaysIso, formatDate, formatIdr, todayIso } from '../services/format';
import { useToast } from '../components/Toast';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import Field from '../components/Field';
import ConfirmDialog from '../components/ConfirmDialog';
import { EmptyState, ErrorState, Pagination, SearchInput, Status, TableSkeleton } from '../components/DataState';

const DEFAULT_LOAN_DAYS = 14;
const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'returned', label: 'Closed' },
];

export function LoanStatus({ loan }) {
  if (loan.status === 'returned') return <Status tone="done">Returned</Status>;
  if (loan.isOverdue) return <Status tone="late">Overdue</Status>;
  return <Status tone="ok">Out</Status>;
}

function NewLoanDialog({ onClose, onSaved }) {
  const notify = useToast();
  const [memberQuery, setMemberQuery] = useState('');
  const [bookQuery, setBookQuery] = useState('');
  const [member, setMember] = useState(null);
  const [books, setBooks] = useState([]);
  const [dueDate, setDueDate] = useState(addDaysIso(DEFAULT_LOAN_DAYS));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const mq = useDebounced(memberQuery);
  const bq = useDebounced(bookQuery);
  const memberResults = useResource(`/members${toQuery({ q: mq, status: 'active', pageSize: 6 })}`);
  const bookResults = useResource(`/books${toQuery({ q: bq, available: true, pageSize: 6 })}`);

  function toggleBook(book) {
    setBooks((list) => (list.some((b) => b.id === book.id) ? list.filter((b) => b.id !== book.id) : [...list, book]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const clientErrors = {};
    if (!member) clientErrors.memberId = 'Choose a member with an active card';
    if (books.length === 0) clientErrors.bookIds = 'Choose at least one book from the shelf';
    if (!dueDate || dueDate < todayIso()) clientErrors.dueDate = 'Pick today or a later date';
    setErrors(clientErrors);
    setFormError('');
    if (Object.keys(clientErrors).length) return;

    setSaving(true);
    try {
      const res = await api.post('/loans', { memberId: member.id, bookIds: books.map((b) => b.id), dueDate });
      notify(`${res.data.items.length} book${res.data.items.length === 1 ? '' : 's'} out to ${res.data.member.name}, due ${formatDate(res.data.dueDate)}`);
      onSaved();
    } catch (err) {
      setErrors(err.details || {});
      setFormError(err.message);
      setSaving(false);
      bookResults.reload();
    }
  }

  return (
    <Modal
      title="Check out"
      size="lg"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="loan-form" className="btn btn-primary" disabled={saving}>
            {saving ? 'Stamping…' : `Check out${books.length ? ` ${books.length} book${books.length === 1 ? '' : 's'}` : ''}`}
          </button>
        </>
      )}
    >
      {formError && <div className="alert" role="alert">{formError}</div>}
      <form id="loan-form" onSubmit={handleSubmit} noValidate className="loan-form">
        <fieldset className={errors.memberId ? 'field-error' : ''}>
          <legend className="label">Borrower</legend>
          {member ? (
            <div className="selected-item">
              <div>
                <p className="cell-title">{member.name}</p>
                <p className="cell-sub mono">{member.memberCode}</p>
              </div>
              <button type="button" className="link-button" onClick={() => setMember(null)}>Change</button>
            </div>
          ) : (
            <>
              <SearchInput value={memberQuery} onChange={setMemberQuery} label="Find a member" placeholder="Name or card number" />
              <ul className="picker-list" aria-label="Members">
                {(memberResults.data?.data || []).map((m) => (
                  <li key={m.id}>
                    <button type="button" className="picker-option" onClick={() => setMember(m)}>
                      <span>{m.name}</span>
                      <span className="mono faint">{m.memberCode}</span>
                    </button>
                  </li>
                ))}
                {memberResults.data && memberResults.data.data.length === 0 && <li className="picker-empty">No active cards match.</li>}
              </ul>
            </>
          )}
          {errors.memberId && <p className="field-message">{errors.memberId}</p>}
        </fieldset>

        <fieldset className={errors.bookIds ? 'field-error' : ''}>
          <legend className="label">Books</legend>
          {books.length > 0 && (
            <ul className="chip-list" aria-label="Chosen books">
              {books.map((b) => (
                <li key={b.id} className="chip">
                  {b.title}
                  <button type="button" onClick={() => toggleBook(b)} aria-label={`Remove ${b.title}`}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <SearchInput value={bookQuery} onChange={setBookQuery} label="Find a book on the shelf" placeholder="Title, author or ISBN" />
          <ul className="picker-list" aria-label="Books on the shelf">
            {(bookResults.data?.data || []).map((b) => {
              const selected = books.some((x) => x.id === b.id);
              return (
                <li key={b.id}>
                  <button type="button" className={`picker-option ${selected ? 'is-selected' : ''}`} onClick={() => toggleBook(b)} aria-pressed={selected}>
                    <span>
                      <span className="check" aria-hidden="true">{selected ? '✓' : ''}</span>
                      {b.title} <span className="faint">— {b.author}</span>
                    </span>
                    <span className="faint small">{b.availableCopies} on shelf</span>
                  </button>
                </li>
              );
            })}
            {bookResults.data && bookResults.data.data.length === 0 && <li className="picker-empty">Nothing on the shelf matches.</li>}
          </ul>
          {errors.bookIds && <p className="field-message">{errors.bookIds}</p>}
        </fieldset>

        <fieldset>
          <legend className="label">Due back</legend>
          <Field label="Due date" error={errors.dueDate} required hint={`Standard loan is ${DEFAULT_LOAN_DAYS} days`}>
            {(p) => <input {...p} type="date" min={todayIso()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ maxWidth: 220 }} />}
          </Field>
        </fieldset>
      </form>
    </Modal>
  );
}

export default function LoansPage() {
  const notify = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(searchParams.get('new') === '1');
  const [returning, setReturning] = useState(null); // { loan, item }
  const status = searchParams.get('status') || '';
  const q = useDebounced(search);

  useEffect(() => {
    if (searchParams.get('new')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data, error, loading, reload } = useResource(`/loans${toQuery({ q, status, page, pageSize: 10 })}`);
  const loans = data?.data || [];

  function setStatus(value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next);
    setPage(1);
  }

  async function confirmReturn() {
    const { loan, item } = returning;
    try {
      const res = await api.post(`/loans/${loan.id}/items/${item.id}/return`);
      const returned = res.data.items.find((i) => i.id === item.id);
      notify(returned.fineIdr > 0
        ? `“${item.title}” is back. Late fee: ${formatIdr(returned.fineIdr)}`
        : `“${item.title}” is back on the shelf`);
    } catch (err) {
      notify(err.message, 'error');
    }
    setReturning(null);
    reload();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="label">Circulation</span>
          <h1>Loans</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Check out books</button>
      </header>

      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Loan status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={status === tab.value ? 'is-active' : ''}
              aria-pressed={status === tab.value}
              onClick={() => setStatus(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="toolbar-end" style={{ flex: '1 1 280px', maxWidth: 380 }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} label="Search by borrower" placeholder="Borrower name or card" />
        </div>
      </div>

      <section>
        {error ? <ErrorState error={error} onRetry={reload} />
          : loading && !data ? <TableSkeleton columns={4} />
            : loans.length === 0 ? (
              q || status
                ? <EmptyState title="No loans here" message="Try another tab or search." />
                : <EmptyState title="Nothing has gone out yet" message="Check out a book to a member to open the first loan." action={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Check out books</button>} />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Borrower</th>
                      <th scope="col">Out / due</th>
                      <th scope="col">Books</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan) => (
                      <tr key={loan.id}>
                        <td>
                          <p className="cell-title">{loan.member.name}</p>
                          <p className="cell-sub mono">{loan.member.memberCode} · #{loan.id}</p>
                        </td>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                          <p className="faint">{formatDate(loan.checkoutDate)}</p>
                          <p className={loan.isOverdue ? 'text-red' : ''}>{formatDate(loan.dueDate)}</p>
                        </td>
                        <td>
                          <ul className="item-list">
                            {loan.items.map((item) => (
                              <li key={item.id}>
                                <span className={item.returnedAt ? 'faint' : ''}>{item.title}</span>
                                {item.returnedAt ? (
                                  <span className="faint small">
                                    back {formatDate(item.returnedAt, true)}
                                    {item.fineIdr > 0 && <> · {formatIdr(item.fineIdr)}</>}
                                  </span>
                                ) : (
                                  <button type="button" className="link-button" onClick={() => setReturning({ loan, item })}>
                                    Check in
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td><LoanStatus loan={loan} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        {data && loans.length > 0 && <Pagination pagination={data.pagination} onPage={setPage} />}
      </section>

      {creating && (
        <NewLoanDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {returning && (
        <ConfirmDialog
          title="Check this book in?"
          message={`“${returning.item.title}” from ${returning.loan.member.name}${returning.loan.isOverdue ? ' is overdue, so a late fee will be added.' : ' goes back on the shelf.'}`}
          confirmLabel="Check in"
          onConfirm={confirmReturn}
          onClose={() => setReturning(null)}
        />
      )}
    </div>
  );
}
