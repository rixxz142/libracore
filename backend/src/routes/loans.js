const express = require('express');
const { validate, parseId, parsePagination, queryString } = require('../validation');
const { HttpError } = require('../errors');
const { requireStaff } = require('../middleware/auth');
const { checkout, returnItem, LOAN_SELECT, toLoan } = require('../services/loans');

function loansRouter({ config, pool }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const q = queryString(req.query.q);
    const status = queryString(req.query.status);

    const where = [];
    const params = [];
    if (status === 'active') where.push(`l.status = 'active'`);
    else if (status === 'returned') where.push(`l.status = 'returned'`);
    else if (status === 'overdue') where.push(`l.status = 'active' AND l.due_date < CURRENT_DATE`);
    if (req.query.memberId) {
      params.push(parseId(String(req.query.memberId), 'memberId'));
      where.push(`l.member_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(m.name ILIKE $${params.length} OR m.member_code ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM loans l JOIN members m ON m.id = l.member_id ${whereSql}`,
      params,
    );
    const { rows } = await pool.query(
      `${LOAN_SELECT} ${whereSql}
        ORDER BY l.created_at DESC, l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    res.json({ data: rows.map(toLoan), pagination: { page, pageSize, total } });
  });

  router.post('/', requireStaff, async (req, res) => {
    const v = validate(req.body).integer('memberId', { required: true, min: 1 }).date('dueDate');
    const raw = req.body?.bookIds;
    let bookIds = [];
    if (!Array.isArray(raw) || raw.length === 0) {
      v.fail('bookIds', 'Select at least one book');
    } else if (!raw.every((id) => Number.isInteger(id) && id > 0)) {
      v.fail('bookIds', 'Book identifiers must be positive whole numbers');
    } else {
      bookIds = [...new Set(raw)];
      if (bookIds.length !== raw.length) v.fail('bookIds', 'Each book can only be added once per loan');
      else if (bookIds.length > config.maxLoanItems) v.fail('bookIds', `A loan can contain at most ${config.maxLoanItems} titles`);
    }
    const { memberId, dueDate } = v.done();

    const loan = await checkout(pool, config, { memberId, bookIds, dueDate, staffId: req.user.id });
    res.status(201).json({ data: loan });
  });

  router.post('/:loanId/items/:itemId/return', requireStaff, async (req, res) => {
    const loanId = parseId(req.params.loanId, 'loanId');
    const itemId = parseId(req.params.itemId, 'itemId');
    const loan = await returnItem(pool, config, { loanId, itemId });
    if (!loan) throw new HttpError(404, 'Loan not found');
    res.json({ data: loan });
  });

  return router;
}

module.exports = { loansRouter };
