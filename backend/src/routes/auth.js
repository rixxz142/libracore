const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { validate } = require('../validation');
const { HttpError } = require('../errors');
const { COOKIE_NAME, cookieOptions, signToken, authenticate } = require('../middleware/auth');
const { BCRYPT_ROUNDS } = require('../bootstrap');

const MIN_PASSWORD_LENGTH = 10;

// Compared against when the email is unknown so response time does not
// reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('libracore-dummy-password', 12);

function authRouter({ config, pool }) {
  const router = express.Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again later.' },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = validate(req.body)
      .email('email', { required: true })
      .string('password', { required: true, max: 200 })
      .done();

    const { rows } = await pool.query(
      'SELECT id, name, email, role, member_id, password_hash, is_active FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    const user = rows[0];
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok || !user.is_active) throw new HttpError(401, 'Invalid email or password');

    res.cookie(COOKIE_NAME, signToken(config, user), cookieOptions(config));
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, memberId: user.member_id } });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions(config));
    res.status(204).end();
  });

  router.get('/me', authenticate({ config, pool }), (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/password', authenticate({ config, pool }), loginLimiter, async (req, res) => {
    const { currentPassword, newPassword } = validate(req.body)
      .string('currentPassword', { required: true, max: 200 })
      .string('newPassword', { required: true, max: 200 })
      .done();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(422, 'Validation failed', { newPassword: `Must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const { rows: [user] } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      throw new HttpError(422, 'Validation failed', { currentPassword: 'Current password is incorrect' });
    }
    await pool.query(
      'UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1',
      [req.user.id, await bcrypt.hash(newPassword, BCRYPT_ROUNDS)],
    );
    res.status(204).end();
  });

  return router;
}

module.exports = { authRouter };
