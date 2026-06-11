const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAdmin, requireContractor } = require('../middleware/auth');

const router = express.Router();

// ── List all contractors (admin) ─────────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
  const contractors = db.prepare(`
    SELECT c.*, n.name as niche_name
    FROM contractors c
    LEFT JOIN niches n ON c.niche_id = n.id
    ORDER BY c.created_at DESC
  `).all();
  // Don't expose sensitive fields
  const safe = contractors.map(({ password_hash, google_refresh_token, ...c }) => c);
  res.json(safe);
});

// ── Get single contractor ────────────────────────────────────────────────────
router.get('/:id', requireContractor, (req, res) => {
  const { id } = req.params;
  // Contractors can only see themselves unless admin
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const contractor = db.prepare(`
    SELECT c.*, n.name as niche_name
    FROM contractors c
    LEFT JOIN niches n ON c.niche_id = n.id
    WHERE c.id = ?
  `).get(id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });
  const { password_hash, google_refresh_token, ...safe } = contractor;
  res.json(safe);
});

// ── Create contractor (admin only) ───────────────────────────────────────────
router.post('/', requireAdmin, (req, res) => {
  const { email, password, name, phone, company_name, niche_id, service_zip_codes } = req.body;
  if (!email || !password || !name || !niche_id || !service_zip_codes?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const existing = db.prepare('SELECT id FROM contractors WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Contractor already exists with that email' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const zips = JSON.stringify(service_zip_codes);
  db.prepare(`
    INSERT INTO contractors (id, email, password_hash, name, phone, company_name, niche_id, service_zip_codes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, email, hash, name, phone || null, company_name || null, niche_id, zips);

  res.status(201).json({ id, email, name, company_name, niche_id, service_zip_codes });
});

// ── Update contractor ────────────────────────────────────────────────────────
router.put('/:id', requireContractor, (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { name, phone, company_name, service_zip_codes, is_active } = req.body;
  const contractor = db.prepare('SELECT * FROM contractors WHERE id = ?').get(id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  db.prepare(`
    UPDATE contractors SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      company_name = COALESCE(?, company_name),
      service_zip_codes = COALESCE(?, service_zip_codes),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    name || null,
    phone || null,
    company_name || null,
    service_zip_codes ? JSON.stringify(service_zip_codes) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    id
  );
  res.json({ message: 'Updated successfully' });
});

// ── Delete contractor (admin only) ───────────────────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE contractors SET is_active = 0 WHERE id = ?').run(id);
  res.json({ message: 'Contractor deactivated' });
});

module.exports = router;
