// Express application entry point.
const fs = require('node:fs');

// Local development without Docker: load backend/.env when present.
// Variables already set in the environment take precedence.
if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env');
}

const { loadConfig } = require('./config');
const { createPool } = require('./db');
const { createApp } = require('./app');
const { bootstrapAdmin, bootstrapBorrower } = require('./bootstrap');

async function waitForDatabase(pool, attempts = 10) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.warn(`[db] not ready (attempt ${i}/${attempts}): ${err.message}`);
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  const config = loadConfig();
  const pool = createPool(config.db);

  await waitForDatabase(pool);
  await bootstrapAdmin(pool, config.bootstrapAdmin);
  await bootstrapBorrower(pool, config.bootstrapBorrower);

  const app = createApp({ config, pool });
  const server = app.listen(config.port, () => {
    console.log(`[api] LibraCore API listening on port ${config.port} (${config.nodeEnv})`);
  });

  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[api] failed to start:', err.message);
  process.exit(1);
});
