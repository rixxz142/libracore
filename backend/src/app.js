// Builds the Express application. Kept separate from server.js so tests can
// create an app against their own database.
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { authenticate, requireStaff } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');
const { authRouter } = require('./routes/auth');
const { booksRouter } = require('./routes/books');
const { membersRouter } = require('./routes/members');
const { loansRouter } = require('./routes/loans');
const { dashboardRouter, reportsRouter } = require('./routes/dashboard');
const { meRouter } = require('./routes/me');

function createApp({ config, pool, logRequests = true }) {
  const app = express();
  const deps = { config, pool };

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Nginx sits in front of the API
  app.use(helmet());
  if (config.clientOrigin) {
    app.use(cors({ origin: config.clientOrigin, credentials: true }));
  }
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  if (logRequests) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
      });
      next();
    });
  }

  // Readiness check: verifies the database connection, not just the process.
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
    } catch (err) {
      console.error('[health] database check failed:', err.message);
      res.status(503).json({ status: 'error', database: 'down' });
    }
  });

  app.use('/api/auth', authRouter(deps));

  const requireAuth = authenticate(deps);
  // Borrowers may browse the catalog; everything else is staff-only.
  app.use('/api/books', requireAuth, booksRouter(deps));
  app.use('/api/me', requireAuth, meRouter(deps));
  app.use('/api/dashboard', requireAuth, requireStaff, dashboardRouter(deps));
  app.use('/api/members', requireAuth, requireStaff, membersRouter(deps));
  app.use('/api/loans', requireAuth, requireStaff, loansRouter(deps));
  app.use('/api/reports', requireAuth, requireStaff, reportsRouter(deps));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
