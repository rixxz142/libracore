import { useResource } from '../services/useResource';
import { formatIdr } from '../services/format';
import { EmptyInline, ErrorState, TableSkeleton } from '../components/DataState';

const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

export default function ReportsPage() {
  const { data, error, loading, reload } = useResource('/reports/overview');

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="label">Administrator</span>
          <h1>Reports</h1>
        </div>
      </header>

      {error ? <ErrorState error={error} onRetry={reload} />
        : loading && !data ? <TableSkeleton columns={3} />
          : <ReportBody data={data} />}
    </div>
  );
}

function ReportBody({ data }) {
  const { totals, monthlyLoans, topBooks, categories } = data;
  const maxMonthly = Math.max(1, ...monthlyLoans.map((m) => m.loans));

  return (
    <>
      <section className="figures" aria-label="All-time totals">
        <div className="figure"><span className="label">Loans</span><p className="figure-value">{totals.totalLoans}</p><p className="figure-note">recorded</p></div>
        <div className="figure"><span className="label">Books lent</span><p className="figure-value">{totals.totalItems}</p><p className="figure-note">individual items</p></div>
        <div className="figure"><span className="label">Late returns</span><p className="figure-value">{totals.lateReturns}</p><p className="figure-note">with a fee</p></div>
        <div className="figure"><span className="label">Fees charged</span><p className="figure-value" style={{ fontSize: 34 }}>{formatIdr(totals.totalFinesIdr)}</p><p className="figure-note">all time</p></div>
      </section>

      <div className="columns">
        <section>
          <div className="section-head"><h2>Loans by month</h2></div>
          <table className="bar-table">
            <caption className="sr-only">Number of loans in each of the last six months</caption>
            <tbody>
              {monthlyLoans.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{monthFormatter.format(new Date(`${m.month}-01T00:00:00`))}</th>
                  <td><span className="bar" style={{ width: `${(m.loans / maxMonthly) * 100}%` }} aria-hidden="true" /></td>
                  <td className="num">{m.loans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <div className="section-head"><h2>Most borrowed</h2></div>
          {topBooks.length === 0 ? <EmptyInline>No loans recorded yet.</EmptyInline> : (
            <ol className="ledger">
              {topBooks.map((b, i) => (
                <li key={b.id}>
                  <span className="ledger-date">No. {i + 1}</span>
                  <div>
                    <p className="ledger-title serif" style={{ fontSize: 17 }}>{b.title}</p>
                    <p className="ledger-sub">{b.author}</p>
                  </div>
                  <span className="mono">{b.timesBorrowed}×</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section>
        <div className="section-head"><h2>Holdings by category</h2></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="num">Titles</th>
                <th scope="col" className="num">Copies</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="num">{c.titles}</td>
                  <td className="num">{c.copies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
