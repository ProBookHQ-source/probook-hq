require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('express-async-errors'); // catches async errors in route handlers automatically

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // trust Cloudflare + Railway proxy
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health',     (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Rate limiting
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/leads',         publicLimiter);
app.use('/api/bookings/book', publicLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/contractors',  require('./routes/contractors'));
app.use('/api/leads',        require('./routes/leads'));
app.use('/api/bookings',     require('./routes/bookings'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/niches',       require('./routes/niches'));

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

app.get('/api/auth/google/connect/:contractorId', (req, res) => {
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
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// Wait for DB schema to be ready before accepting requests
db._ready.then(() => {
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║       ProBook Backend Running          ║
║  http://localhost:${PORT}                 ║
╚════════════════════════════════════════╝
    `);
  });
});
