import { Link } from 'react-router-dom';
import { useResource } from '../services/useResource';
import { formatDate, longToday } from '../services/format';
import { EmptyInline, ErrorState } from '../components/DataState';
import { LoanStatus } from './LoansPage';

function LoanLedger({ loans, empty, dateOf }) {
  if (loans.length === 0) return <EmptyInline>{empty}</EmptyInline>;
  return (
    <ul className="ledger">
      {loans.map((loan) => (
        <li key={loan.id}>
          <span className="ledger-date">{dateOf(loan)}</span>
          <div>
            <p className="ledger-title">{loan.member.name}</p>
            <p className="ledger-sub">{loan.items.map((i) => i.title).join(' · ')}</p>
          </div>
          <LoanStatus loan={loan} />
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useResource('/dashboard');

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="label">{longToday()}</span>
          <h1>The daybook</h1>
        </div>
        <Link to="/loans?new=1" className="btn btn-primary">Check out books</Link>
      </header>

      {error ? <ErrorState error={error} onRetry={reload} />
        : loading && !data ? <div className="skeleton-block" role="status" aria-label="Loading" />
          : (
            <>
              <section className="figures" aria-label="Today in numbers">
                <div className="figure">
                  <span className="label">On the shelf</span>
                  <p className="figure-value">{data.stats.availableCopies}<small> / {data.stats.totalCopies}</small></p>
                  <p className="figure-note">copies across {data.stats.totalTitles} titles</p>
                </div>
                <div className="figure">
                  <span className="label">Out on loan</span>
                  <p className="figure-value">{data.stats.totalCopies - data.stats.availableCopies}</p>
                  <p className="figure-note">in {data.stats.activeLoans} open loan{data.stats.activeLoans === 1 ? '' : 's'}</p>
                </div>
                <div className="figure">
                  <span className="label">Overdue</span>
                  <p className={`figure-value ${data.stats.overdueItems > 0 ? 'text-red' : ''}`}>{data.stats.overdueItems}</p>
                  <p className={`figure-note ${data.stats.overdueItems > 0 ? 'text-red' : ''}`}>
                    {data.stats.overdueItems > 0 ? 'books past their due date' : 'nothing late'}
                  </p>
                </div>
                <div className="figure">
                  <span className="label">Members</span>
                  <p className="figure-value">{data.stats.activeMembers}</p>
                  <p className="figure-note">with active cards</p>
                </div>
              </section>

              <div className="columns">
                <section>
                  <div className="section-head">
                    <h2>Chase up</h2>
                    <Link to="/loans?status=overdue">All overdue</Link>
                  </div>
                  <LoanLedger
                    loans={data.overdueLoans}
                    empty="Nothing overdue. A quiet day."
                    dateOf={(l) => `due ${formatDate(l.dueDate, true)}`}
                  />
                </section>
                <section>
                  <div className="section-head">
                    <h2>Lately at the desk</h2>
                    <Link to="/loans">Loan history</Link>
                  </div>
                  <LoanLedger
                    loans={data.recentLoans}
                    empty="No loans recorded yet."
                    dateOf={(l) => formatDate(l.checkoutDate, true)}
                  />
                </section>
              </div>
            </>
          )}
    </div>
  );
}
