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

// ── CORS for inbound lead endpoint ───────────────────────────────────────────
// Registered BEFORE Helmet so nothing can strip or override these headers.
// The inbound endpoint is called from external client sites (hvactemplate.pages.dev, etc.)
// Security is enforced server-side: API key auth + allowed_origins check inside the route.
app.use('/api/leads/inbound', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'", "'unsafe-inline'"],  // Vite SPA requires inline scripts
      styleSrc:        ["'self'", "'unsafe-inline'"],
      imgSrc:          ["'self'", "data:", "blob:", "https:"],
      connectSrc:      ["'self'"],
      fontSrc:         ["'self'", "data:"],
      objectSrc:       ["'none'"],
      baseUri:         ["'self'"],
      frameAncestors:  ["'none'"],
    },
  },
}));

app.use(cors({
  // Fail closed: if FRONTEND_URL isn't set, fall back to the known production URL
  origin: process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app',
  credentials: true,
}));
app.use(express.json({ limit: '50kb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health',     (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Rate limiting — public booking/lead endpoints (60 per 15 min)
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/leads',         publicLimiter);
app.use('/api/bookings/book', publicLimiter);

// Rate limiting — auth endpoints (10 per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});
app.use('/api/auth/admin/login',      authLimiter);
app.use('/api/auth/contractor/login', authLimiter);

// Rate limiting — contractor apply (3 per hour — applications shouldn't be frequent)
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many applications from this IP. Please try again in an hour.' },
});
app.use('/api/auth/contractor/apply', applyLimiter);

// Rate limiting — inbound API (30 per 15 min — stricter than public limiter)
const inboundLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many inbound lead submissions. Please slow down.' },
});
app.use('/api/leads/inbound', inboundLimiter);

// Rate limiting — intake tracking (120 per 15 min — allows rapid step clicks without abuse)
const intakeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Too many tracking events. Please slow down.' },
});
app.use('/api/intake', intakeLimiter);

// Rate limiting — homeowner self-service cancel/reschedule (10 per 15 min per IP)
const selfServiceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/bookings/cancel-token',     selfServiceLimiter);
app.use('/api/bookings/reschedule-token', selfServiceLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/contractors',  require('./routes/contractors'));
app.use('/api/leads',        require('./routes/leads'));
app.use('/api/bookings',     require('./routes/bookings'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/niches',       require('./routes/niches'));
app.use('/api/apikeys',      require('./routes/apikeys'));
app.use('/api/intake',       require('./routes/intake'));

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
db._ready.then(async () => {
  // Run any pending column migrations
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS reset_token TEXT`);
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`);
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
  // Mark all active contractors as approved so status stays consistent with is_active
  await db.query(`UPDATE contractors SET status = 'approved' WHERE is_active = 1 AND status IS NULL`);
  // Per-contractor API key routing: allows each HVAC client's site to route leads directly to their contractor
  await db.query(`ALTER TABLE inbound_api_keys ADD COLUMN IF NOT EXISTS contractor_id TEXT REFERENCES contractors(id) ON DELETE SET NULL`);
  // Domain restriction: only accept inbound leads from whitelisted origins (prevents API key theft/abuse)
  await db.query(`ALTER TABLE inbound_api_keys ADD COLUMN IF NOT EXISTS allowed_origins TEXT`);
  // Intake form step tracking — powers dropoff funnel in admin dashboard
  await db.query(`
    CREATE TABLE IF NOT EXISTS intake_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'intake_step',
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      direction TEXT NOT NULL,
      client_id TEXT NOT NULL,
      business_name TEXT,
      ts TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Start scheduled jobs (appointment reminders, etc.)
  require('./services/cron');

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║       Tractify Backend Running          ║
║  http://localhost:${PORT}                 ║
╚════════════════════════════════════════╝
    `);
  });
});
