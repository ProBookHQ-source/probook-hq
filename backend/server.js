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

// ── CORS for endpoints called by external client sites ────────────────────────
// Registered BEFORE Helmet so nothing can strip or override these headers.
// Covers: lead inbound submission, slot availability lookup, and inline booking confirm.
// Security is enforced server-side per route (API key auth, allowed_origins, token validation).
const externalClientCors = (methods) => (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods + ', OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};
app.use('/api/leads/inbound',        externalClientCors('POST'));
app.use('/api/availability',         externalClientCors('GET'));
app.use('/api/bookings/book',        externalClientCors('POST'));
app.use('/api/bookings/book-direct', externalClientCors('POST'));
app.use('/api/contractors/public',   externalClientCors('GET'));

// Security headers
app.use(helmet({
  // cross-origin allows external client sites (hvactemplate.pages.dev, etc.) to read
  // API responses via fetch(). Without this, Helmet's default CORP: same-origin blocks
  // cross-origin reads even when Access-Control-Allow-Origin: * is set.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
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

// Skip cors() for paths that already have wildcard CORS set above.
// cors() with a string origin would override the wildcard and block external client sites.
app.use((req, res, next) => {
  if (
    req.path.startsWith('/api/leads/inbound') ||
    req.path.startsWith('/api/availability') ||
    req.path.startsWith('/api/bookings/book') ||
    req.path.startsWith('/api/contractors/public') ||
    req.path.startsWith('/api/twilio') ||      // Twilio webhooks — server-to-server
    req.path.startsWith('/api/leads/facebook') // Facebook webhooks — server-to-server
  ) return next();
  cors({
    origin: process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app',
  })(req, res, next);
});
app.use(express.json({ limit: '50kb' }));
// Twilio webhooks are sent as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

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
app.use('/api/twilio',       require('./routes/twilio'));
app.use('/api/leads/facebook', require('./routes/facebook')); // Facebook Lead Ads webhook
app.use('/api/deploy',       require('./routes/deploy'));   // ← Cloudflare Worker calls this after intake form submit
app.use('/api/contractor/ai-chat', require('./routes/aiChat'));
app.use('/api/admin/ai-chat',     require('./routes/adminAI')); // Jose's business intelligence brain

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
  // Personal booking slug — lets contractors share tractifyhq.com/schedule/:slug
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS booking_slug TEXT UNIQUE`);
  // Allow lead_id to be NULL in appointments (external blocks + direct bookings)
  await db.query(`ALTER TABLE appointments ALTER COLUMN lead_id DROP NOT NULL`).catch(() => {});
  // Twilio missed call text-back — each contractor gets their own Twilio number
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS twilio_number TEXT`);
  // Booking source tracking — which ad channel drove each booking
  // Values: google_search, bing_search, facebook_ad, facebook_lead_ad, nextdoor_ad,
  //         nextdoor_organic, facebook_group, gbp, missed_call, sms_keyword,
  //         google_reviewer, direct, unknown
  await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_source TEXT`);
  // Contractor acquisition source — which content/ad drove each contractor to the intake form
  // Jose tags intake URLs: intake.tractifyhq.com?src=facebook_video_roof
  // Values: facebook_ad, facebook_organic, facebook_video, instagram, tiktok,
  //         google_ad, nextdoor, referral, direct, etc.
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS acquisition_source TEXT`);
  // Self-serve onboarding checklist — tracks which setup steps each contractor has completed
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS onboarding_steps JSONB DEFAULT '{}'`);
  // Track when contractor first logged in — used to detect 48hr nudge window
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ`);
  // Prevent duplicate nudge emails — set after first nudge is sent
  await db.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS onboarding_nudge_sent_at TIMESTAMPTZ`);

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

  // Brain context log — machine-written decisions and insights from the admin brain
  // Persists in Postgres so it survives every Railway deploy
  await db.query(`
    CREATE TABLE IF NOT EXISTS brain_context (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'decision',
      summary TEXT NOT NULL,
      detail TEXT,
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
