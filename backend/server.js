require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 4000;

// ── Middleware (no DB needed) ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health check — responds BEFORE DB is open ─────────────────────────────────
// Railway uses this to decide when the new container is "ready".
// We respond immediately so Railway can kill the old container, freeing the DB lock.
app.get('/health',     (req, res) => res.json({ ok: true }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ── "Starting up" guard — queues API calls until DB is loaded ─────────────────
let dbReady = false;
app.use('/api', (req, res, next) => {
  if (dbReady) return next();
  res.status(503).json({ error: 'Server starting up — please retry in a few seconds.' });
});

// ── Bind port NOW so Railway marks us healthy and kills the old container ──────
app.listen(PORT, () => {
  console.log(`⚡ Port ${PORT} bound — Railway will now kill old container`);

  // How long to wait before touching the DB.
  // Old container gets SIGTERM as soon as we bind the port; give it time to die
  // and release the SQLite lock before we try to open the file.
  const delay = parseInt(process.env.DB_INIT_DELAY_MS || '12000');
  console.log(`⏳ Waiting ${delay}ms for old container to release DB lock...`);

  setTimeout(() => {
    try {
      loadApp();
      dbReady = true;
      console.log('✅ App fully initialized — serving requests');
    } catch (err) {
      console.error('💥 Failed to initialize app:', err);
      process.exit(1);
    }
  }, delay);
});

// ── Load everything that needs DB (called after the delay) ───────────────────
function loadApp() {
  const googleCalendar = require('./services/googleCalendar');
  const db             = require('./database/db');

  // Rate limiting
  const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { error: 'Too many requests, please try again later' },
  });
  app.use('/api/leads',        publicLimiter);
  app.use('/api/bookings/book', publicLimiter);

  // Routes
  app.use('/api/auth',         require('./routes/auth'));
  app.use('/api/contractors',  require('./routes/contractors'));
  app.use('/api/leads',        require('./routes/leads'));
  app.use('/api/bookings',     require('./routes/bookings'));
  app.use('/api/availability', require('./routes/availability'));
  app.use('/api/niches',       require('./routes/niches'));

  // Google Calendar OAuth
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

  app.get('/api/auth/google/connect/:contractorId', (req, res) => {
    const url = googleCalendar.getAuthUrl(req.params.contractorId);
    res.json({ url });
  });

  // Serve React frontend
  const FRONTEND_DIST = path.join(__dirname, '../frontend/dist');
  if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
  }

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  console.log(`
╔════════════════════════════════════════╗
║       ProBook Backend Running          ║
║  http://localhost:${PORT}                 ║
╚════════════════════════════════════════╝
  `);
}
