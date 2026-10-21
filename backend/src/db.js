// PostgreSQL connection pool. All queries use parameterized SQL.
const { Pool } = require('pg');

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Date objects,
// so due dates are not shifted by the API container's timezone.
const { types } = require('pg');
types.setTypeParser(1082, (value) => value);

function createPool(dbConfig) {
  const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    options: `-c timezone=${dbConfig.timezone}`,
  });
  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });
  return pool;
}

// Runs fn(client) inside a transaction, rolling back on any error.
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createPool, withTransaction };
