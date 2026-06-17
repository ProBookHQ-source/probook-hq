const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { signToken, requireContractor } = require('../middleware/auth');

const router = express.Router();

// ── Admin login ───────────────────────────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const admin = await db.prepare('SELECT * FROM admins WHERE email = $1').get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = signToken({ id: admin.id, email: admin.email, role: 'admin', name: admin.name });
  res.json({ token, user: { id: admin.id, email: admin.email, name: admin.name, role: 'admin' } });
});

// ── Admin register (first-time setup only — disabled once any admin exists) ───
router.post('/admin/register', async (req, res) => {
  const { email, password, name, setupKey } = req.body;
  if (setupKey !== (process.env.SETUP_KEY || 'setup-1234')) {
    return res.status(403).json({ error: 'Invalid setup key' });
  }
  // Permanently disable after first admin is created
  const { rows: countRows } = await db.query('SELECT COUNT(*) as cnt FROM admins');
  if (parseInt(countRows[0].cnt, 10) > 0) {
    return res.status(410).json({ error: 'Setup is complete. Registration is disabled.' });
  }
  const existing = await db.prepare('SELECT id FROM admins WHERE email = $1').get(email);
  if (existing) return res.status(409).json({ error: 'Admin already exists' });

  const id   = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  await db.prepare('INSERT INTO admins (id, email, password_hash, name) VALUES ($1, $2, $3, $4)')
    .run(id, email, hash, name);
  const token = signToken({ id, email, role: 'admin', name });
  res.status(201).json({ token, user: { id, email, name, role: 'admin' } });
});

// ── Contractor login ──────────────────────────────────────────────────────────
router.post('/contractor/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const contractor = await db.prepare('SELECT * FROM contractors WHERE email = $1').get(email);
  if (!contractor || !bcrypt.compareSync(password, contractor.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!contractor.is_active) return res.status(403).json({ error: 'Account is inactive' });

  const token = signToken({
    id: contractor.id, email: contractor.email, role: 'contractor',
    name: contractor.name, niche_id: contractor.niche_id,
  });
  res.json({
    token,
    user: {
      id: contractor.id, email: contractor.email, name: contractor.name,
      company_name: contractor.company_name, phone: contractor.phone || '',
      role: 'contractor',
    },
  });
});

// ── Contractor self-apply (public) ────────────────────────────────────────────
router.post('/contractor/apply', async (req, res) => {
  try {
    const { name, email, password, phone, company_name, niche_id, service_zip_codes, service_radius_miles } = req.body;
    if (!name || !email || !password || !niche_id || !service_zip_codes) {
      return res.status(400).json({ error: 'Name, email, password, niche, and service zip codes are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = await db.prepare('SELECT id FROM contractors WHERE email = $1').get(email);
    if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

    const niche = await db.prepare('SELECT * FROM niches WHERE id = $1').get(niche_id);
    if (!niche) return res.status(400).json({ error: 'Invalid niche selected.' });

    const id   = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    await db.prepare(
      `INSERT INTO contractors (id, email, password_hash, name, phone, company_name, niche_id, service_zip_codes, service_radius_miles, is_active, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NOW())`
    ).run(id, email, hash, name, phone || null, company_name || null, niche_id, service_zip_codes, service_radius_miles || 25);

    const notifications = require('../services/notifications');
    const contractor = { id, name, email, phone, company_name, niche_name: niche.name, service_zip_codes };
    notifications.sendContractorApplicationAck(contractor).catch(console.error);
    notifications.sendContractorApplicationAlert(contractor).catch(console.error);

    res.status(201).json({ message: 'Application received! We\'ll review it and email you within 1–2 business days.' });
  } catch (err) {
    console.error('Apply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Approve a contractor application (admin) ──────────────────────────────────
router.put('/contractor/:id/approve', async (req, res) => {
  const { requireAdmin } = require('../middleware/auth');
  // inline admin check
  const authHeader = req.headers.authorization;
  const jwt = require('jsonwebtoken');
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'probook-secret-key');
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  } catch { return res.status(401).json({ error: 'Invalid token' }); }

  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(req.params.id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });
  if (contractor.is_active) return res.status(409).json({ error: 'Already active' });

  await db.prepare("UPDATE contractors SET is_active = 1 WHERE id = $1").run(req.params.id);

  const notifications = require('../services/notifications');
  const niches = await db.prepare('SELECT name FROM niches WHERE id = $1').get(contractor.niche_id);
  notifications.sendContractorApproved({ ...contractor, niche_name: niches?.name }).catch(console.error);

  res.json({ message: 'Contractor approved and notified.' });
});

// ── Get current user profile ──────────────────────────────────────────────────
router.get('/me', requireContractor, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
