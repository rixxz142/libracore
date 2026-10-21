// Test harness: starts a real, throwaway PostgreSQL server (embedded-postgres),
// applies database/init.sql and serves the Express app on a random port.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/config');
const { createPool } = require('../src/db');
const { createApp } = require('../src/app');
const { bootstrapAdmin } = require('../src/bootstrap');

const ADMIN = { email: 'admin@example.local', password: 'test-admin-password-123' };
const LIBRARIAN = { email: 'librarian@example.local', password: 'test-librarian-password-123' };

// Resolves the PostgreSQL binaries shipped by embedded-postgres for this OS.
async function postgresBinaries() {
  const platform = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
  return import(`@embedded-postgres/${platform}-${process.arch}`);
}

function pgCtl(binary, args) {
  // stdio is ignored so the detached server does not keep pipes to this process open.
  const result = spawnSync(binary, args, { stdio: 'ignore', timeout: 60000 });
  if (result.status !== 0) throw new Error(`pg_ctl ${args[0]} failed (exit ${result.status})`);
}

async function startTestEnv() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { pg_ctl: pgCtlBinary } = await postgresBinaries();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libracore-pg-'));
  const port = 55000 + Math.floor(Math.random() * 5000);
  // embedded-postgres runs initdb; the server itself is started and stopped
  // with pg_ctl so every backend process shuts down cleanly on all platforms.
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: true,
    onLog: () => {},
  });
  await pg.initialise();
  pgCtl(pgCtlBinary, ['start', '-w', '-D', dataDir, '-o', `-p ${port} -h 127.0.0.1`, '-l', path.join(dataDir, 'server.log')]);
  const stopPostgres = () => pgCtl(pgCtlBinary, ['stop', '-w', '-m', 'fast', '-D', dataDir]);

  const admin = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'postgres' });
  try {
    await admin.connect();
    await admin.query('CREATE DATABASE libracore_test');
    await admin.end();
  } catch (err) {
    stopPostgres();
    throw err;
  }

  const config = loadConfig({
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(port),
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_NAME: 'libracore_test',
    JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
    DAILY_FINE_IDR: '2000',
    MAX_LOAN_ITEMS: '3',
    LOAN_PERIOD_DAYS: '14',
    LOGIN_RATE_LIMIT: '1000',
  });
  const pool = createPool(config.db);
  await pool.query(fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'init.sql'), 'utf8'));
  await bootstrapAdmin(pool, { name: 'Test Admin', ...ADMIN });
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Test Librarian', $1, $2, 'librarian')`,
    [LIBRARIAN.email, await bcrypt.hash(LIBRARIAN.password, 4)],
  );

  const app = createApp({ config, pool, logRequests: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function stop() {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections(); // fetch keeps connections alive
    });
    await pool.end();
    stopPostgres();
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (err) {
      // Windows can hold the data directory briefly after shutdown; it is only a temp folder.
      console.warn(`[test] could not remove ${dataDir}: ${err.code}`);
    }
  }

  return { config, pool, baseUrl, stop };
}

// Minimal HTTP client that keeps the auth cookie between requests.
function client(baseUrl) {
  let cookie = '';
  async function request(method, url, body) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  }
  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    patch: (url, body) => request('PATCH', url, body),
    put: (url, body) => request('PUT', url, body),
    delete: (url) => request('DELETE', url),
    async login(creds) {
      const res = await request('POST', '/api/auth/login', creds);
      if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
      return res;
    },
  };
}

module.exports = { startTestEnv, client, ADMIN, LIBRARIAN };
