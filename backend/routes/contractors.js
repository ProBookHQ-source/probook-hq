const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAdmin, requireContractor } = require('../middleware/auth');

const router = express.Router();

// ── List all contractors (admin) ──────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  const contractors = await db.prepare(`
    SELECT c.id, c.email, c.name, c.phone, c.company_name, c.niche_id,
           c.service_zip_codes, c.google_calendar_id, c.is_active, c.created_at,
           n.name as niche_name
    FROM contractors c
    LEFT JOIN niches n ON c.niche_id = n.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(contractors);
});

// ── Get single contractor ─────────────────────────────────────────────────────
router.get('/:id', requireContractor, async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const contractor = await db.prepare(`
    SELECT c.id, c.email, c.name, c.phone, c.company_name, c.niche_id,
           c.service_zip_codes, c.google_calendar_id, c.is_active, c.created_at,
           n.name as niche_name
    FROM contractors c
    LEFT JOIN niches n ON c.niche_id = n.id
    WHERE c.id = $1
  `).get(id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });
  res.json(contractor);
});

// ── Create contractor (admin only) ────────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const { email, password, name, phone, company_name, niche_id, service_zip_codes } = req.body;
  if (!email || !password || !name || !niche_id || !service_zip_codes?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const existing = await db.prepare('SELECT id FROM contractors WHERE email = $1').get(email);
  if (existing) return res.status(409).json({ error: 'Contractor already exists with that email' });

  const id   = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const zips = JSON.stringify(service_zip_codes);
  await db.prepare(`
    INSERT INTO contractors (id, email, password_hash, name, phone, company_name, niche_id, service_zip_codes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `).run(id, email, hash, name, phone || null, company_name || null, niche_id, zips);

  res.status(201).json({ id, email, name, company_name, niche_id, service_zip_codes });
});

// ── Update contractor ─────────────────────────────────────────────────────────
router.put('/:id', requireContractor, async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  const { name, phone, company_name, service_zip_codes, is_active } = req.body;
  await db.prepare(`
    UPDATE contractors SET
      name = COALESCE($1, name),
      phone = COALESCE($2, phone),
      company_name = COALESCE($3, company_name),
      service_zip_codes = COALESCE($4, service_zip_codes),
      is_active = COALESCE($5, is_active)
    WHERE id = $6
  `).run(
    name || null,
    phone || null,
    company_name || null,
    service_zip_codes ? JSON.stringify(service_zip_codes) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    id
  );
  res.json({ message: 'Contractor updated' });
});

// ── Delete contractor (admin only) ────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(req.params.id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  // Null out FK references before deleting
  await db.prepare('UPDATE leads SET assigned_contractor_id = NULL WHERE assigned_contractor_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM round_robin_state WHERE last_contractor_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM availability WHERE contractor_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM contractors WHERE id = $1').run(req.params.id);

  res.json({ message: 'Contractor deleted' });
});

module.exports = router;
