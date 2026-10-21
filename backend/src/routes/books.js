const express = require('express');
const { validate, parseId, parsePagination, queryString } = require('../validation');
const { HttpError } = require('../errors');
const { requireStaff, requireAdmin } = require('../middleware/auth');
const { withTransaction } = require('../db');

const ISBN_RE = /^[0-9Xx-]{10,20}$/;
const BOOK_COLUMNS = `id, isbn, title, author, category, publisher, publication_year,
  total_copies, available_copies, archived_at, created_at, updated_at`;

function toBook(row) {
  return {
    id: row.id,
    isbn: row.isbn,
    title: row.title,
    author: row.author,
    category: row.category,
    publisher: row.publisher,
    publicationYear: row.publication_year,
    totalCopies: row.total_copies,
    availableCopies: row.available_copies,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bookFields(body, { partial }) {
  // Required on create; on update, required only when the field is sent.
  const present = (field) => !partial || (body != null && body[field] !== undefined);
  const v = validate(body)
    .string('isbn', { max: 20, nullable: true, pattern: ISBN_RE, patternMessage: 'ISBN may contain only digits, X and dashes (10-20 characters)' })
    .string('title', { required: present('title') })
    .string('author', { required: present('author') })
    .string('category', { required: present('category'), max: 100 })
    .string('publisher', { nullable: true })
    .integer('publicationYear', { min: 1000, max: new Date().getFullYear() + 1, nullable: true })
    .integer('totalCopies', { required: present('totalCopies'), min: 0, max: 10000 });
  const values = v.done();
  if (values.isbn) values.isbn = values.isbn.toUpperCase();
  return values;
}

function booksRouter({ pool }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const q = queryString(req.query.q);
    const category = queryString(req.query.category);
    const includeArchived = req.query.includeArchived === 'true';
    const availableOnly = req.query.available === 'true';

    const where = [];
    const params = [];
    if (!includeArchived) where.push('archived_at IS NULL');
    if (availableOnly) where.push('available_copies > 0');
    if (q) {
      params.push(`%${q}%`);
      where.push(`(title ILIKE $${params.length} OR author ILIKE $${params.length} OR isbn ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query(`SELECT COUNT(*)::int AS total FROM books ${whereSql}`, params);
    const { rows } = await pool.query(
      `SELECT ${BOOK_COLUMNS} FROM books ${whereSql}
        ORDER BY title, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    const { rows: categories } = await pool.query(
      'SELECT DISTINCT category FROM books WHERE archived_at IS NULL ORDER BY category',
    );
    res.json({
      data: rows.map(toBook),
      pagination: { page, pageSize, total },
      categories: categories.map((c) => c.category),
    });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await pool.query(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Book not found');
    res.json({ data: toBook(rows[0]) });
  });

  router.post('/', requireStaff, async (req, res) => {
    const b = bookFields(req.body, { partial: false });
    const { rows } = await pool.query(
      `INSERT INTO books (isbn, title, author, category, publisher, publication_year, total_copies, available_copies)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING ${BOOK_COLUMNS}`,
      [b.isbn ?? null, b.title, b.author, b.category, b.publisher ?? null, b.publicationYear ?? null, b.totalCopies],
    );
    res.status(201).json({ data: toBook(rows[0]) });
  });

  router.patch('/:id', requireStaff, async (req, res) => {
    const id = parseId(req.params.id);
    const b = bookFields(req.body, { partial: true });

    const book = await withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        'SELECT total_copies, available_copies FROM books WHERE id = $1 FOR UPDATE',
        [id],
      );
      const current = rows[0];
      if (!current) throw new HttpError(404, 'Book not found');

      let available = current.available_copies;
      if (b.totalCopies !== undefined) {
        const onLoan = current.total_copies - current.available_copies;
        if (b.totalCopies < onLoan) {
          throw new HttpError(422, 'Validation failed', {
            totalCopies: `Cannot be less than the ${onLoan} cop${onLoan === 1 ? 'y' : 'ies'} currently on loan`,
          });
        }
        available = b.totalCopies - onLoan;
      }

      const columns = {
        isbn: b.isbn, title: b.title, author: b.author, category: b.category,
        publisher: b.publisher, publication_year: b.publicationYear,
        total_copies: b.totalCopies, available_copies: b.totalCopies !== undefined ? available : undefined,
      };
      const sets = [];
      const params = [id];
      for (const [col, value] of Object.entries(columns)) {
        if (value === undefined) continue;
        params.push(value === '' ? null : value);
        sets.push(`${col} = $${params.length}`);
      }
      sets.push('updated_at = NOW()');
      const { rows: [updated] } = await client.query(
        `UPDATE books SET ${sets.join(', ')} WHERE id = $1 RETURNING ${BOOK_COLUMNS}`,
        params,
      );
      return updated;
    });
    res.json({ data: toBook(book) });
  });

  // Archive instead of deleting so loan history stays intact.
  router.delete('/:id', requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await pool.query(
      `UPDATE books SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
        WHERE id = $1 RETURNING ${BOOK_COLUMNS}`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'Book not found');
    res.json({ data: toBook(rows[0]) });
  });

  return router;
}

module.exports = { booksRouter };
