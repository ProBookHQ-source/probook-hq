const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { signToken, requireAdmin, requireContractor } = require('../middleware/auth');
const notifications = require('../services/notifications');

const router = express.Router();

// ── Admin login ───────────────────────────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const admin = await db.prepare('SELECT * FROM admins WHERE email = $1').get(email.toLowerCase().trim());
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    console.warn(`[AUTH] Failed admin login attempt — email: ${email} — IP: ${req.ip}`);
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
  const existing = await db.prepare('SELECT id FROM admins WHERE email = $1').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'Admin already exists' });

  const id   = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  await db.prepare('INSERT INTO admins (id, email, password_hash, name) VALUES ($1, $2, $3, $4)')
    .run(id, email.toLowerCase().trim(), hash, name);
  const token = signToken({ id, email: email.toLowerCase().trim(), role: 'admin', name });
  res.status(201).json({ token, user: { id, email: email.toLowerCase().trim(), name, role: 'admin' } });
});

// ── Contractor login ──────────────────────────────────────────────────────────
router.post('/contractor/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const contractor = await db.prepare('SELECT * FROM contractors WHERE email = $1').get(email.toLowerCase().trim());
  if (!contractor || !bcrypt.compareSync(password, contractor.password_hash)) {
    console.warn(`[AUTH] Failed contractor login attempt — email: ${email} — IP: ${req.ip}`);
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

    // Normalize email before any DB check or insert
    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    // Validate zip codes — must contain only digits, spaces, commas, hyphens
    if (!/^[\d\s,\-]+$/.test(service_zip_codes.trim())) {
      return res.status(400).json({ error: 'Service ZIP codes must contain only digits, commas, and hyphens.' });
    }

    // Cap service radius at 100 miles
    const radius = Math.min(parseInt(service_radius_miles) || 25, 100);

    const existing = await db.prepare('SELECT id FROM contractors WHERE email = $1').get(normalizedEmail);
    if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

    const niche = await db.prepare('SELECT * FROM niches WHERE id = $1').get(niche_id);
    if (!niche) return res.status(400).json({ error: 'Invalid niche selected.' });

    const id   = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    await db.prepare(
      `INSERT INTO contractors (id, email, password_hash, name, phone, company_name, niche_id, service_zip_codes, service_radius_miles, is_active, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NOW())`
    ).run(id, normalizedEmail, hash, name.trim(), phone || null, company_name?.trim() || null, niche_id, service_zip_codes.trim(), radius);

    const notifications = require('../services/notifications');
    const contractor = { id, name: name.trim(), email: normalizedEmail, phone, company_name: company_name?.trim(), niche_name: niche.name, service_zip_codes };
    notifications.sendContractorApplicationAck(contractor).catch(console.error);
    notifications.sendContractorApplicationAlert(contractor).catch(console.error);

    res.status(201).json({ message: 'Application received! We\'ll review it and email you within 1–2 business days.' });
  } catch (err) {
    console.error('Apply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Decline a contractor application (admin) ──────────────────────────────────
router.put('/contractor/:id/decline', requireAdmin, async (req, res) => {
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(req.params.id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  await db.prepare('UPDATE contractors SET declined_at = NOW() WHERE id = $1').run(req.params.id);

  const notifications = require('../services/notifications');
  notifications.sendContractorDeclined(contractor).catch(console.error);

  res.json({ message: 'Application declined.' });
});

// ── Delete a declined contractor application (admin) ──────────────────────────
router.delete('/contractor/:id/application', requireAdmin, async (req, res) => {
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(req.params.id);
  if (!contractor) return res.status(404).json({ error: 'Not found' });
  if (contractor.is_active) return res.status(400).json({ error: 'Cannot delete an active contractor this way.' });

  await db.prepare('DELETE FROM contractors WHERE id = $1').run(req.params.id);
  res.json({ message: 'Application deleted.' });
});

// ── Approve a contractor application (admin) ──────────────────────────────────
router.put('/contractor/:id/approve', requireAdmin, async (req, res) => {
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(req.params.id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });
  if (contractor.is_active) return res.status(409).json({ error: 'Already active' });

  await db.prepare("UPDATE contractors SET is_active = 1, declined_at = NULL WHERE id = $1").run(req.params.id);

  const notifications = require('../services/notifications');
  const niche = await db.prepare('SELECT name FROM niches WHERE id = $1').get(contractor.niche_id);
  notifications.sendContractorApproved({ ...contractor, niche_name: niche?.name }).catch(console.error);

  res.json({ message: 'Contractor approved and notified.' });
});

// ── Get current user profile ──────────────────────────────────────────────────
router.get('/me', requireContractor, (req, res) => {
  res.json({ user: req.user });
});

// ── Forgot password ───────────────────────────────────────────────────────────
router.post('/contractor/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const contractor = await db.prepare('SELECT * FROM contractors WHERE email = $1').get(email.toLowerCase().trim());

  // Always respond 200 — don't reveal whether email exists
  if (!contractor || contractor.status !== 'approved') {
    return res.json({ message: 'If that email is in our system, a reset link has been sent.' });
  }

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.prepare('UPDATE contractors SET reset_token = $1, reset_token_expires = $2 WHERE id = $3')
    .run(token, expires.toISOString(), contractor.id);

  const resetUrl = `${process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app'}/reset-password?token=${token}`;
  notifications.sendPasswordReset(contractor, resetUrl).catch(console.error);

  res.json({ message: 'If that email is in our system, a reset link has been sent.' });
});

// ── Reset password ────────────────────────────────────────────────────────────
router.post('/contractor/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const contractor = await db.prepare(
    'SELECT * FROM contractors WHERE reset_token = $1 AND reset_token_expires > NOW()'
  ).get(token);

  if (!contractor) return res.status(400).json({ error: 'Reset link is invalid or has expired.' });

  const hash = bcrypt.hashSync(password, 10);
  await db.prepare('UPDATE contractors SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2')
    .run(hash, contractor.id);

  res.json({ message: 'Password updated. You can now log in.' });
});

module.exports = router;
