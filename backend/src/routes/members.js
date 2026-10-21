const express = require('express');
const { validate, parseId, parsePagination, queryString } = require('../validation');
const { HttpError } = require('../errors');
const bcrypt = require('bcryptjs');
const { requireStaff, requireAdmin } = require('../middleware/auth');
const { withTransaction } = require('../db');
const { BCRYPT_ROUNDS } = require('../bootstrap');

const MIN_PASSWORD_LENGTH = 10;

const MEMBER_CODE_RE = /^[A-Za-z0-9-]{3,30}$/;
const PHONE_RE = /^\+?[0-9 ()-]{6,30}$/;
const MEMBER_COLUMNS = `id, member_code, name, email, phone, status, created_at, updated_at,
  (SELECT COUNT(*)::int FROM loan_items li JOIN loans l ON l.id = li.loan_id
    WHERE l.member_id = members.id AND li.returned_at IS NULL) AS active_items,
  (SELECT COUNT(*)::int FROM loans l WHERE l.member_id = members.id) AS loan_count,
  EXISTS (SELECT 1 FROM users u WHERE u.member_id = members.id) AS has_account`;

function toMember(row) {
  return {
    id: row.id,
    memberCode: row.member_code,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    activeItems: row.active_items,
    loanCount: row.loan_count,
    hasAccount: row.has_account,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function memberFields(body, { partial }) {
  // Required on create; on update, required only when the field is sent.
  const present = (field) => !partial || (body != null && body[field] !== undefined);
  const values = validate(body)
    .string('memberCode', { required: present('memberCode'), max: 30, pattern: MEMBER_CODE_RE, patternMessage: 'Use 3-30 letters, digits or dashes' })
    .string('name', { required: present('name'), max: 120 })
    .email('email', { nullable: true })
    .string('phone', { max: 30, nullable: true, pattern: PHONE_RE, patternMessage: 'Must be a valid phone number' })
    .oneOf('status', ['active', 'inactive'])
    .done();
  if (values.memberCode) values.memberCode = values.memberCode.toUpperCase();
  return values;
}

function membersRouter({ pool }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const q = queryString(req.query.q);
    const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : '';

    const where = [];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(name ILIKE $1 OR member_code ILIKE $1 OR email ILIKE $1)`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: [{ total }] } = await pool.query(`SELECT COUNT(*)::int AS total FROM members ${whereSql}`, params);
    const { rows } = await pool.query(
      `SELECT ${MEMBER_COLUMNS} FROM members ${whereSql}
        ORDER BY name, id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );
    res.json({ data: rows.map(toMember), pagination: { page, pageSize, total } });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const { rows } = await pool.query(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = $1`, [id]);
    if (!rows[0]) throw new HttpError(404, 'Member not found');
    res.json({ data: toMember(rows[0]) });
  });

  router.post('/', requireStaff, async (req, res) => {
    const m = memberFields(req.body, { partial: false });
    const { rows } = await pool.query(
      `INSERT INTO members (member_code, name, email, phone, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${MEMBER_COLUMNS}`,
      [m.memberCode, m.name, m.email || null, m.phone || null, m.status || 'active'],
    );
    res.status(201).json({ data: toMember(rows[0]) });
  });

  router.patch('/:id', requireStaff, async (req, res) => {
    const id = parseId(req.params.id);
    const m = memberFields(req.body, { partial: true });
    const columns = { member_code: m.memberCode, name: m.name, email: m.email, phone: m.phone, status: m.status };

    const member = await withTransaction(pool, async (client) => {
      const { rows: [account] } = await client.query('SELECT id FROM users WHERE member_id = $1 FOR UPDATE', [id]);
      if (account && m.email === null) {
        throw new HttpError(422, 'Validation failed', { email: 'Required while this member has login access' });
      }

      const sets = [];
      const params = [id];
      for (const [col, value] of Object.entries(columns)) {
        if (value === undefined) continue;
        params.push(value === '' ? null : value);
        sets.push(`${col} = $${params.length}`);
      }
      sets.push('updated_at = NOW()');
      const { rows } = await client.query(
        `UPDATE members SET ${sets.join(', ')} WHERE id = $1 RETURNING ${MEMBER_COLUMNS}`,
        params,
      );
      if (!rows[0]) throw new HttpError(404, 'Member not found');

      // The borrower signs in with the member's email; keep them in sync.
      if (account) {
        await client.query(
          'UPDATE users SET email = LOWER($2), name = $3, updated_at = NOW() WHERE id = $1',
          [account.id, rows[0].email, rows[0].name],
        );
      }
      return rows[0];
    });
    res.json({ data: toMember(member) });
  });

  // Members with loan history cannot be deleted; deactivate them instead.
  router.delete('/:id', requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query('SELECT id FROM members WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw new HttpError(404, 'Member not found');
      const { rows: [{ count }] } = await client.query('SELECT COUNT(*)::int AS count FROM loans WHERE member_id = $1', [id]);
      if (count > 0) {
        throw new HttpError(409, 'This member has loan history and cannot be deleted. Set their status to inactive instead.');
      }
      await client.query('DELETE FROM members WHERE id = $1', [id]); // cascades to the borrower login
    });
    res.status(204).end();
  });

  // Create or reset the borrower login for a member. The login email is the member's email.
  router.put('/:id/account', requireStaff, async (req, res) => {
    const id = parseId(req.params.id);
    const { password } = validate(req.body).string('password', { required: true, max: 200 }).done();
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(422, 'Validation failed', { password: `Must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const created = await withTransaction(pool, async (client) => {
      const { rows: [member] } = await client.query('SELECT id, name, email FROM members WHERE id = $1 FOR UPDATE', [id]);
      if (!member) throw new HttpError(404, 'Member not found');
      if (!member.email) throw new HttpError(422, 'Add an email address to this member before giving them login access');

      const { rowCount } = await client.query(
        'UPDATE users SET password_hash = $2, is_active = TRUE, updated_at = NOW() WHERE member_id = $1',
        [id, passwordHash],
      );
      if (rowCount === 1) return false;
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, member_id) VALUES ($1, LOWER($2), $3, 'borrower', $4)`,
        [member.name, member.email, passwordHash, id],
      );
      return true;
    });

    const { rows } = await pool.query(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = $1`, [id]);
    res.status(created ? 201 : 200).json({ data: toMember(rows[0]) });
  });

  router.delete('/:id/account', requireStaff, async (req, res) => {
    const id = parseId(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM users WHERE member_id = $1', [id]);
    if (rowCount === 0) throw new HttpError(404, 'This member has no login access');
    res.status(204).end();
  });

  return router;
}

module.exports = { membersRouter };
