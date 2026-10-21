// Borrower self-service. Every query is scoped to req.user.memberId, which
// comes from the authenticated session, never from the request; a borrower
// cannot read another member's loans.
const express = require('express');
const { parsePagination, queryString } = require('../validation');
const { requireBorrower } = require('../middleware/auth');
const { LOAN_SELECT, toLoan } = require('../services/loans');

function meRouter({ config, pool }) {
  const router = express.Router();
  router.use(requireBorrower);

  router.get('/summary', async (req, res) => {
    const memberId = req.user.memberId;
    const { rows: [row] } = await pool.query(
      `SELECT m.member_code, m.name, m.status,
              (SELECT COUNT(*)::int FROM loan_items li JOIN loans l ON l.id = li.loan_id
                WHERE l.member_id = m.id AND li.returned_at IS NULL) AS books_on_loan,
              (SELECT COUNT(*)::int FROM loan_items li JOIN loans l ON l.id = li.loan_id
                WHERE l.member_id = m.id AND li.returned_at IS NULL AND l.due_date < CURRENT_DATE) AS overdue_items,
              (SELECT MIN(l.due_date)::text FROM loans l
                WHERE l.member_id = m.id AND l.status = 'active') AS next_due_date,
              (SELECT COALESCE(SUM(li.fine_idr), 0)::int FROM loan_items li JOIN loans l ON l.id = li.loan_id
                WHERE l.member_id = m.id) AS fines_paid_idr,
              (SELECT COALESCE(SUM(GREATEST(CURRENT_DATE - l.due_date, 0)), 0)::int FROM loan_items li JOIN loans l ON l.id = li.loan_id
                WHERE l.member_id = m.id AND li.returned_at IS NULL) AS overdue_days
         FROM members m WHERE m.id = $1`,
      [memberId],
    );
    res.json({
      member: { memberCode: row.member_code, name: row.name, status: row.status },
      booksOnLoan: row.books_on_loan,
      overdueItems: row.overdue_items,
      nextDueDate: row.next_due_date,
      finesChargedIdr: row.fines_paid_idr,
      // What would be charged if every overdue book were returned today.
      accruingFineIdr: row.overdue_days * config.dailyFineIdr,
      dailyFineIdr: config.dailyFineIdr,
      maxLoanItems: config.maxLoanItems,
      loanPeriodDays: config.loanPeriodDays,
    });
  });

  router.get('/loans', async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const status = queryString(req.query.status);
    const params = [req.user.memberId];
    let filter = '';
    if (status === 'active') filter = `AND l.status = 'active'`;
    else if (status === 'returned') filter = `AND l.status = 'returned'`;

    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM loans l WHERE l.member_id = $1 ${filter}`,
      params,
    );
    const { rows } = await pool.query(
      `${LOAN_SELECT} WHERE l.member_id = $1 ${filter}
        ORDER BY (l.status = 'active') DESC, l.due_date, l.id DESC LIMIT $2 OFFSET $3`,
      [...params, pageSize, offset],
    );
    res.json({ data: rows.map(toLoan), pagination: { page, pageSize, total } });
  });

  return router;
}

module.exports = { meRouter };
