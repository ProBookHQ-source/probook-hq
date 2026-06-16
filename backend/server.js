require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('express-async-errors'); // catches async errors in route handlers automatically

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const rateLimit = require('express-rate-limit');
const helmet  = require('helmet');

// ── Sentry — activates only when SENTRY_DSN is set in Railway env vars ────────
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.2, // capture 20% of transactions for performance monitoring
  });
  console.log('🔍 Sentry error monitoring active');
} else {
  console.log('ℹ️  SENTRY_DSN not set — error monitoring inactive (add it in Railway to enable)');
}

const app  = express();
const PORT = process.env.PORT || 4000;

// Warn early if JWT secret is insecure
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production') {
  console.warn('⚠️  WARNING: JWT_SECRET is not set or is using the insecure default. Set a strong secret in your Railway env vars.');
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // trust Cloudflare + Railway proxy

// Security headers — protects against XSS, clickjacking, MIME sniffing, etc.
// contentSecurityPolicy disabled because we serve our own frontend from the same origin
app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
}));
app.use(express.json({ limit: '50kb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health',     (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Rate limiting — public booking/lead endpoints
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/leads',         publicLimiter);
app.use('/api/bookings/book', publicLimiter);

// Rate limiting — auth endpoints (stricter: 10 per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});
app.use('/api/auth/admin/login',      authLimiter);
app.use('/api/auth/contractor/login', authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/contractors',  require('./routes/contractors'));
app.use('/api/leads',        require('./routes/leads'));
app.use('/api/bookings',     require('./routes/bookings'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/niches',       require('./routes/niches'));
app.use('/api/apikeys',      require('./routes/apikeys'));

// ── Google Calendar OAuth ─────────────────────────────────────────────────────
const googleCalendar = require('./services/googleCalendar');
const db             = require('./database/db');

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state: contractorId } = req.query;
  if (!code || !contractorId) {
    return res.redirect(`${process.env.FRONTEND_URL}/contractor?gcal=error`);
  }
  const tokens = await googleCalendar.exchangeCode(code);
  if (tokens.refresh_token) {
    await db.prepare('UPDATE contractors SET google_refresh_token = $1 WHERE id = $2')
      .run(tokens.refresh_token, contractorId);
  }
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/contractor?gcal=success`);
});

app.get('/api/auth/google/connect/:contractorId', require('./middleware/auth').requireContractor, (req, res) => {
  if (req.user.id !== req.params.contractorId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const url = googleCalendar.getAuthUrl(req.params.contractorId);
  res.json({ url });
});

// ── Serve React frontend ──────────────────────────────────────────────────────
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const reqId = Math.random().toString(36).slice(2, 8);
  console.error(`[${reqId}] ${req.method} ${req.path}`, err.message || err);

  // Report to Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, { tags: { requestId: reqId, path: req.path } });
  }

  res.status(500).json({ error: 'Internal server error', requestId: reqId });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// Wait for DB schema to be ready before accepting requests
db._ready.then(() => {
  // Start scheduled jobs (appointment reminders, etc.)
  require('./services/cron');

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║       ProBook Backend Running          ║
║  http://localhost:${PORT}                 ║
╚════════════════════════════════════════╝
    `);
  });
});
