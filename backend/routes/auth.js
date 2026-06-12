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

// ── Admin register (first-time setup) ────────────────────────────────────────
router.post('/admin/register', async (req, res) => {
  const { email, password, name, setupKey } = req.body;
  if (setupKey !== (process.env.SETUP_KEY || 'setup-1234')) {
    return res.status(403).json({ error: 'Invalid setup key' });
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
      company_name: contractor.company_name, role: 'contractor',
    },
  });
});

// ── Get current user profile ──────────────────────────────────────────────────
router.get('/me', requireContractor, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
