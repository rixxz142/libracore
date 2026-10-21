// First-run administrator setup. Creates the admin only when the users table
// is empty; never resets an existing password.
const bcrypt = require('bcryptjs');
const { EMAIL_RE } = require('./validation');

const BCRYPT_ROUNDS = 12;

async function bootstrapAdmin(pool, { name, email, password }) {
  if (!email || !password) {
    console.log('[bootstrap] BOOTSTRAP_ADMIN_EMAIL/PASSWORD not set; skipping admin creation');
    return { created: false };
  }
  if (!EMAIL_RE.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL is not a valid email address');
  if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Single statement so two API instances starting together cannot both insert.
  const { rowCount } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     SELECT $1, $2, $3, 'admin'
     WHERE NOT EXISTS (SELECT 1 FROM users)`,
    [name, email.toLowerCase(), passwordHash],
  );

  if (rowCount === 1) {
    console.log(`[bootstrap] created initial administrator ${email.toLowerCase()}`);
    return { created: true };
  }
  console.log('[bootstrap] staff users already exist; bootstrap skipped');
  return { created: false };
}

// Optional demo borrower: gives sign-in access to the existing member whose
// email matches. Skipped when that member already has an account, so an
// existing password is never reset.
async function bootstrapBorrower(pool, { email, password }) {
  if (!email || !password) return { created: false };
  if (password.length < 10) throw new Error('BOOTSTRAP_BORROWER_PASSWORD must be at least 10 characters');

  const { rows: [member] } = await pool.query(
    'SELECT id, name FROM members WHERE LOWER(email) = LOWER($1)',
    [email],
  );
  if (!member) {
    console.warn(`[bootstrap] no member with email ${email}; borrower bootstrap skipped`);
    return { created: false };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { rowCount } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, member_id)
     SELECT $1, LOWER($2), $3, 'borrower', $4
     WHERE NOT EXISTS (SELECT 1 FROM users WHERE member_id = $4 OR LOWER(email) = LOWER($2))`,
    [member.name, email, passwordHash, member.id],
  );
  if (rowCount === 1) {
    console.log(`[bootstrap] created borrower sign-in for ${email.toLowerCase()}`);
    return { created: true };
  }
  console.log('[bootstrap] borrower sign-in already exists; bootstrap skipped');
  return { created: false };
}

module.exports = { bootstrapAdmin, bootstrapBorrower, BCRYPT_ROUNDS };
