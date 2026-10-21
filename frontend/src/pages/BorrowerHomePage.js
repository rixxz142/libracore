import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toQuery } from '../services/api';
import { useResource } from '../services/useResource';
import { daysUntil, formatDate, formatIdr } from '../services/format';
import { EmptyState, ErrorState, Pagination, Status } from '../components/DataState';

function dueLabel(dueDate) {
  const days = daysUntil(dueDate);
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${formatDate(dueDate, true)}`;
}

function Summary({ summary }) {
  const { booksOnLoan, overdueItems, nextDueDate, accruingFineIdr, dailyFineIdr } = summary;
  if (booksOnLoan === 0) {
    return (
      <p className="prose-summary">
        You have <strong>no books out</strong> right now. Have a look through the <Link to="/catalog">catalog</Link>.
      </p>
    );
  }
  return (
    <p className="prose-summary">
      You have <strong>{booksOnLoan} book{booksOnLoan === 1 ? '' : 's'}</strong> out.{' '}
      {overdueItems > 0 ? (
        <span className="text-red">
          {overdueItems} {overdueItems === 1 ? 'is' : 'are'} overdue — {formatIdr(accruingFineIdr)} so far, plus {formatIdr(dailyFineIdr)} a day each.
        </span>
      ) : (
        <>The next one is due back <strong>{formatDate(nextDueDate)}</strong>.</>
      )}
    </p>
  );
}

function Slip({ loan, item }) {
  const late = loan.isOverdue && !item.returnedAt;
  return (
    <article className="slip">
      <div>
        <h3>{item.title}</h3>
        <p className="cell-sub">{item.author}</p>
      </div>
      {item.returnedAt ? (
        <Status tone="done">Returned {formatDate(item.returnedAt, true)}{item.fineIdr > 0 ? ` · fee ${formatIdr(item.fineIdr)}` : ''}</Status>
      ) : (
        <span className={`due-stamp ${late ? 'late' : ''}`}>{dueLabel(loan.dueDate)}</span>
      )}
      <div className="slip-foot">
        <span>Out {formatDate(loan.checkoutDate, true)}</span>
        <span className="mono">Loan #{loan.id}</span>
      </div>
    </article>
  );
}

export default function BorrowerHomePage() {
  const [tab, setTab] = useState('active');
  const [page, setPage] = useState(1);
  const summary = useResource('/me/summary');
  // History reads every loan, so books returned from a still-open loan are included.
  const loans = useResource(`/me/loans${toQuery({ status: tab === 'active' ? 'active' : '', page, pageSize: 12 })}`);

  // One slip per book: open tab shows books still out, history shows returned ones.
  const slips = (loans.data?.data || []).flatMap((loan) => loan.items
    .filter((item) => (tab === 'active' ? !item.returnedAt : Boolean(item.returnedAt)))
    .map((item) => ({ loan, item })));

  return (
    <div className="page">
      {summary.error ? <ErrorState error={summary.error} onRetry={summary.reload} />
        : !summary.data ? <div className="skeleton-block" role="status" aria-label="Loading" />
          : (
            <>
              <section className="member-card" aria-label="Your library card">
                <div>
                  <span className="label">Library card</span>
                  <p className="code">{summary.data.member.memberCode}</p>
                </div>
                <div>
                  <h2>{summary.data.member.name}</h2>
                  {summary.data.member.status === 'active'
                    ? <Status tone="ok">Active — you can borrow up to {summary.data.maxLoanItems} titles per loan</Status>
                    : <Status tone="off">Inactive — please visit the desk</Status>}
                </div>
                <div className="barcode" aria-hidden="true" />
              </section>
              <Summary summary={summary.data} />
            </>
          )}

      <section>
        <div className="section-head">
          <div className="tabs" role="group" aria-label="Which loans">
            <button type="button" className={tab === 'active' ? 'is-active' : ''} aria-pressed={tab === 'active'} onClick={() => { setTab('active'); setPage(1); }}>
              Out now
            </button>
            <button type="button" className={tab === 'returned' ? 'is-active' : ''} aria-pressed={tab === 'returned'} onClick={() => { setTab('returned'); setPage(1); }}>
              History
            </button>
          </div>
        </div>

        {loans.error ? <ErrorState error={loans.error} onRetry={loans.reload} />
          : loans.loading && !loans.data ? <div className="skeleton-block" role="status" aria-label="Loading" />
            : slips.length === 0 ? (
              <EmptyState
                title={tab === 'active' ? 'Nothing out' : 'No history yet'}
                message={tab === 'active' ? 'Books you borrow at the desk will appear here with their due dates.' : 'Returned books will be listed here.'}
              />
            ) : (
              <div className="slips" style={{ marginTop: 18 }}>
                {slips.map(({ loan, item }) => <Slip key={item.id} loan={loan} item={item} />)}
              </div>
            )}
        {loans.data && loans.data.pagination.total > loans.data.pagination.pageSize && (
          <Pagination pagination={loans.data.pagination} onPage={setPage} />
        )}
      </section>
    </div>
  );
}
