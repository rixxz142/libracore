// Loan and inventory business rules. Checkout and return run inside
// transactions with row locks so inventory can never go negative or be
// restored twice.
const { withTransaction } = require('../db');
const { HttpError } = require('../errors');

// Whole calendar days between two 'YYYY-MM-DD' dates (to - from).
function daysBetween(from, to) {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

function calculateFine(dueDate, returnDate, dailyFineIdr) {
  const overdueDays = Math.max(0, daysBetween(dueDate, returnDate));
  return { overdueDays, fineIdr: overdueDays * dailyFineIdr };
}

async function checkout(pool, config, { memberId, bookIds, dueDate, staffId }) {
  return withTransaction(pool, async (client) => {
    const { rows: [{ today }] } = await client.query('SELECT CURRENT_DATE::text AS today');
    const due = dueDate || addDays(today, config.loanPeriodDays);
    if (due < today) throw new HttpError(422, 'Validation failed', { dueDate: 'Due date cannot be in the past' });

    const { rows: memberRows } = await client.query(
      'SELECT id, status FROM members WHERE id = $1 FOR SHARE',
      [memberId],
    );
    if (memberRows.length === 0) throw new HttpError(404, 'Member not found');
    if (memberRows[0].status !== 'active') throw new HttpError(409, 'Inactive members cannot borrow books');

    // Lock in a consistent order to avoid deadlocks between concurrent checkouts.
    const { rows: books } = await client.query(
      `SELECT id, title, available_copies, archived_at
         FROM books WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
      [bookIds],
    );
    if (books.length !== bookIds.length) throw new HttpError(404, 'One or more books were not found');
    const unavailable = books.filter((b) => b.archived_at || b.available_copies < 1);
    if (unavailable.length > 0) {
      throw new HttpError(409, `No available copies: ${unavailable.map((b) => b.title).join(', ')}`);
    }

    const { rows: [loan] } = await client.query(
      `INSERT INTO loans (member_id, staff_id, checkout_date, due_date)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [memberId, staffId, today, due],
    );
    await client.query(
      `INSERT INTO loan_items (loan_id, book_id) SELECT $1, unnest($2::int[])`,
      [loan.id, bookIds],
    );
    await client.query(
      `UPDATE books SET available_copies = available_copies - 1, updated_at = NOW()
        WHERE id = ANY($1::int[])`,
      [bookIds],
    );
    return getLoan(client, loan.id);
  });
}

async function returnItem(pool, config, { loanId, itemId }) {
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT li.id, li.book_id, li.returned_at, l.due_date
         FROM loan_items li JOIN loans l ON l.id = li.loan_id
        WHERE li.id = $1 AND li.loan_id = $2
        FOR UPDATE OF li, l`,
      [itemId, loanId],
    );
    const item = rows[0];
    if (!item) throw new HttpError(404, 'Loan item not found');
    if (item.returned_at) throw new HttpError(409, 'This item has already been returned');

    const { rows: [{ today }] } = await client.query('SELECT CURRENT_DATE::text AS today');
    const { fineIdr } = calculateFine(item.due_date, today, config.dailyFineIdr);

    await client.query(
      'UPDATE loan_items SET returned_at = NOW(), fine_idr = $2 WHERE id = $1',
      [item.id, fineIdr],
    );
    await client.query(
      'UPDATE books SET available_copies = available_copies + 1, updated_at = NOW() WHERE id = $1',
      [item.book_id],
    );
    await client.query(
      `UPDATE loans SET status = 'returned', returned_at = NOW()
        WHERE id = $1
          AND NOT EXISTS (SELECT 1 FROM loan_items WHERE loan_id = $1 AND returned_at IS NULL)`,
      [loanId],
    );
    return getLoan(client, loanId);
  });
}

const LOAN_SELECT = `
  SELECT l.id, l.checkout_date, l.due_date, l.status, l.returned_at, l.created_at,
         (l.status = 'active' AND l.due_date < CURRENT_DATE) AS is_overdue,
         json_build_object('id', m.id, 'memberCode', m.member_code, 'name', m.name) AS member,
         json_build_object('id', u.id, 'name', u.name) AS staff,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', li.id, 'bookId', b.id, 'title', b.title, 'author', b.author,
                    'returnedAt', li.returned_at, 'fineIdr', li.fine_idr) ORDER BY li.id)
             FROM loan_items li JOIN books b ON b.id = li.book_id
            WHERE li.loan_id = l.id), '[]') AS items
    FROM loans l
    JOIN members m ON m.id = l.member_id
    JOIN users u ON u.id = l.staff_id`;

function toLoan(row) {
  return {
    id: row.id,
    checkoutDate: row.checkout_date,
    dueDate: row.due_date,
    status: row.status,
    isOverdue: row.is_overdue,
    returnedAt: row.returned_at,
    createdAt: row.created_at,
    member: row.member,
    staff: row.staff,
    items: row.items,
  };
}

async function getLoan(db, id) {
  const { rows } = await db.query(`${LOAN_SELECT} WHERE l.id = $1`, [id]);
  return rows[0] ? toLoan(rows[0]) : null;
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = { calculateFine, daysBetween, addDays, checkout, returnItem, getLoan, LOAN_SELECT, toLoan };
