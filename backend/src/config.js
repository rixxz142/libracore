// Reads and validates configuration from environment variables.

function intFromEnv(env, name, fallback, { min = 0 } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }
  return value;
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters');
  }

  return {
    nodeEnv,
    port: intFromEnv(env, 'PORT', 3000, { min: 1 }),
    db: {
      host: env.DB_HOST || '127.0.0.1',
      port: intFromEnv(env, 'DB_PORT', 5432, { min: 1 }),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      timezone: env.DB_TIMEZONE || 'Asia/Jakarta',
    },
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
    cookieSecure: env.COOKIE_SECURE === 'true',
    clientOrigin: env.CLIENT_ORIGIN || '',
    bootstrapAdmin: {
      name: env.BOOTSTRAP_ADMIN_NAME || 'Library Admin',
      email: env.BOOTSTRAP_ADMIN_EMAIL || '',
      password: env.BOOTSTRAP_ADMIN_PASSWORD || '',
    },
    bootstrapBorrower: {
      email: env.BOOTSTRAP_BORROWER_EMAIL || '',
      password: env.BOOTSTRAP_BORROWER_PASSWORD || '',
    },
    dailyFineIdr: intFromEnv(env, 'DAILY_FINE_IDR', 2000),
    maxLoanItems: intFromEnv(env, 'MAX_LOAN_ITEMS', 5, { min: 1 }),
    loanPeriodDays: intFromEnv(env, 'LOAN_PERIOD_DAYS', 14, { min: 1 }),
    loginRateLimit: intFromEnv(env, 'LOGIN_RATE_LIMIT', 10, { min: 1 }),
  };
}

module.exports = { loadConfig };
