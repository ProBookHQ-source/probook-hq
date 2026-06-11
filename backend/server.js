require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const db = require('./database/db');
const googleCalendar = require('./services/googleCalendar');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Rate limiting for public endpoints
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 60,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/leads', publicLimiter);
app.use('/api/bookings/book', publicLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/contractors',  require('./routes/contractors'));
app.use('/api/leads',        require('./routes/leads'));
app.use('/api/bookings',     require('./routes/bookings'));
app.use('/api/availability', require('./routes/availability'));

// ── Google Calendar OAuth callback ──────────────────────────────────────────
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state: contractorId } = req.query;
  if (!code || !contractorId) {
    return res.redirect(`${process.env.FRONTEND_URL}/contractor?gcal=error`);
  }
  try {
    const tokens = await googleCalendar.exchangeCode(code);
    if (tokens.refresh_token) {
      db.prepare('UPDATE contractors SET google_refresh_token = ? WHERE id = ?')
        .run(tokens.refresh_token, contractorId);
    }
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/contractor?gcal=success`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/contractor?gcal=error`);
  }
});

// ── Generate Google Calendar auth URL for a contractor ───────────────────────
app.get('/api/auth/google/connect/:contractorId', (req, res) => {
  const url = googleCalendar.getAuthUrl(req.params.contractorId);
  res.json({ url });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve React frontend (built files) ───────────────────────────────────────
const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // All non-API routes → React app (handles client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found. Run `npm run setup` to build the frontend.' });
  });
}

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║       ProBook Backend Running          ║
║  http://localhost:${PORT}                 ║
╚════════════════════════════════════════╝
  `);
});
