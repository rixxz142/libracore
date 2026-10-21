const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { LOAN_SELECT, toLoan } = require('../services/loans');

function dashboardRouter({ pool }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { rows: [stats] } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM books WHERE archived_at IS NULL) AS total_titles,
        (SELECT COALESCE(SUM(total_copies), 0)::int FROM books WHERE archived_at IS NULL) AS total_copies,
        (SELECT COALESCE(SUM(available_copies), 0)::int FROM books WHERE archived_at IS NULL) AS available_copies,
        (SELECT COUNT(*)::int FROM members WHERE status = 'active') AS active_members,
        (SELECT COUNT(*)::int FROM loans WHERE status = 'active') AS active_loans,
        (SELECT COUNT(*)::int FROM loan_items li JOIN loans l ON l.id = li.loan_id
          WHERE li.returned_at IS NULL AND l.due_date < CURRENT_DATE) AS overdue_items`);

    const { rows: recent } = await pool.query(`${LOAN_SELECT} ORDER BY l.created_at DESC, l.id DESC LIMIT 5`);
    const { rows: overdue } = await pool.query(
      `${LOAN_SELECT} WHERE l.status = 'active' AND l.due_date < CURRENT_DATE ORDER BY l.due_date LIMIT 5`,
    );

    res.json({
      stats: {
        totalTitles: stats.total_titles,
        totalCopies: stats.total_copies,
        availableCopies: stats.available_copies,
        activeMembers: stats.active_members,
        activeLoans: stats.active_loans,
        overdueItems: stats.overdue_items,
      },
      recentLoans: recent.map(toLoan),
      overdueLoans: overdue.map(toLoan),
    });
  });

  return router;
}

function reportsRouter({ pool }) {
  const router = express.Router();

  router.get('/overview', requireAdmin, async (req, res) => {
    const { rows: monthly } = await pool.query(`
      SELECT to_char(month, 'YYYY-MM') AS month,
             COUNT(l.id)::int AS loans
        FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                             date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS month
        LEFT JOIN loans l ON date_trunc('month', l.checkout_date) = month
       GROUP BY month ORDER BY month`);

    const { rows: topBooks } = await pool.query(`
      SELECT b.id, b.title, b.author, COUNT(li.id)::int AS times_borrowed
        FROM loan_items li JOIN books b ON b.id = li.book_id
       GROUP BY b.id ORDER BY times_borrowed DESC, b.title LIMIT 5`);

    const { rows: [totals] } = await pool.query(`
      SELECT COUNT(*)::int AS total_loans,
             (SELECT COUNT(*)::int FROM loan_items) AS total_items,
             (SELECT COALESCE(SUM(fine_idr), 0)::int FROM loan_items) AS total_fines_idr,
             (SELECT COUNT(*)::int FROM loan_items WHERE fine_idr > 0) AS late_returns
        FROM loans`);

    const { rows: byCategory } = await pool.query(`
      SELECT category, COUNT(*)::int AS titles, SUM(total_copies)::int AS copies
        FROM books WHERE archived_at IS NULL GROUP BY category ORDER BY category`);

    res.json({
      totals: {
        totalLoans: totals.total_loans,
        totalItems: totals.total_items,
        totalFinesIdr: totals.total_fines_idr,
        lateReturns: totals.late_returns,
      },
      monthlyLoans: monthly,
      topBooks: topBooks.map((b) => ({ id: b.id, title: b.title, author: b.author, timesBorrowed: b.times_borrowed })),
      categories: byCategory,
    });
  });

  return router;
}

module.exports = { dashboardRouter, reportsRouter };
