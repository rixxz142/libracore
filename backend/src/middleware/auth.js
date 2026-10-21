// Authentication (signed JWT in an HttpOnly cookie) and role checks.
const jwt = require('jsonwebtoken');
const { HttpError } = require('../errors');

const COOKIE_NAME = 'libracore_token';

function cookieOptions(config) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
  };
}

function signToken(config, user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

// Verifies the cookie and reloads the user so deactivated accounts and
// role changes take effect immediately.
function authenticate({ config, pool }) {
  return async (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return next(new HttpError(401, 'Authentication required'));

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return next(new HttpError(401, 'Session is invalid or has expired'));
    }

    const { rows } = await pool.query(
      'SELECT id, name, email, role, member_id, is_active FROM users WHERE id = $1',
      [Number(payload.sub)],
    );
    const user = rows[0];
    if (!user || !user.is_active) return next(new HttpError(401, 'Session is invalid or has expired'));

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role, memberId: user.member_id };
    return next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to perform this action'));
    }
    return next();
  };
}

// Any active staff member (admin or librarian).
const requireStaff = requireRole('admin', 'librarian');
const requireAdmin = requireRole('admin');
const requireBorrower = requireRole('borrower');

module.exports = { COOKIE_NAME, cookieOptions, signToken, authenticate, requireStaff, requireAdmin, requireBorrower };
