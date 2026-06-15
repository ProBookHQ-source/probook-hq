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
           c.service_radius_miles, c.max_appointments_per_day,
           n.name as niche_name
    FROM contractors c
    LEFT JOIN niches n ON c.niche_id = n.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(contractors);
});

// ── Performance stats (admin only) — MUST be before /:id ─────────────────────
// Returns per-contractor breakdown: leads matched, booked, completed, cancelled, conversion rate
router.get('/admin/performance', requireAdmin, async (req, res) => {
  const { rows } = await db.query(`
    SELECT
      c.id,
      c.name,
      c.company_name,
      n.name                                                         AS niche_name,
      COUNT(DISTINCT l.id)                                           AS leads_matched,
      COUNT(DISTINCT CASE WHEN l.status IN ('booked','completed','cancelled') THEN l.id END) AS leads_booked,
      COUNT(DISTINCT CASE WHEN l.status = 'completed'  THEN l.id END) AS leads_completed,
      COUNT(DISTINCT CASE WHEN a.status = 'cancelled'  THEN a.id END) AS appts_cancelled,
      COUNT(DISTINCT CASE WHEN a.status = 'confirmed'  THEN a.id END) AS appts_confirmed,
      COUNT(DISTINCT CASE WHEN a.status = 'completed'  THEN a.id END) AS appts_completed,
      ROUND(
        CASE WHEN COUNT(DISTINCT l.id) = 0 THEN 0
             ELSE COUNT(DISTINCT CASE WHEN l.status IN ('booked','completed') THEN l.id END)::numeric
                  / COUNT(DISTINCT l.id) * 100
        END, 1
      )                                                              AS conversion_pct
    FROM contractors c
    LEFT JOIN niches n ON c.niche_id = n.id
    LEFT JOIN leads l ON l.assigned_contractor_id = c.id
    LEFT JOIN appointments a ON a.contractor_id = c.id AND a.lead_id IS NOT NULL
    WHERE c.is_active = 1
    GROUP BY c.id, c.name, c.company_name, n.name
    ORDER BY leads_matched DESC
  `);
  res.json(rows);
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
           c.service_radius_miles, c.max_appointments_per_day,
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

  const { name, phone, company_name, service_zip_codes, is_active, service_radius_miles, max_appointments_per_day } = req.body;
  await db.prepare(`
    UPDATE contractors SET
      name = COALESCE($1, name),
      phone = COALESCE($2, phone),
      company_name = COALESCE($3, company_name),
      service_zip_codes = COALESCE($4, service_zip_codes),
      is_active = COALESCE($5, is_active),
      service_radius_miles = COALESCE($6, service_radius_miles),
      max_appointments_per_day = $7
    WHERE id = $8
  `).run(
    name || null,
    phone || null,
    company_name || null,
    service_zip_codes ? JSON.stringify(service_zip_codes) : null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    service_radius_miles !== undefined ? (parseInt(service_radius_miles) || null) : null,
    max_appointments_per_day !== undefined ? (parseInt(max_appointments_per_day) || null) : null,
    id
  );
  res.json({ message: 'Contractor updated' });
});

// ── Change password (contractor self or admin) ────────────────────────────────
router.put('/:id/password', requireContractor, async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  // Non-admins must verify current password
  if (req.user.role !== 'admin') {
    if (!current_password) return res.status(400).json({ error: 'Current password required' });
    const valid = bcrypt.compareSync(current_password, contractor.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  await db.prepare('UPDATE contractors SET password_hash = $1 WHERE id = $2').run(hash, id);
  res.json({ message: 'Password updated' });
});

// ── Delete contractor (admin only) ────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(req.params.id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  // Null out / clean up FK references before deleting
  await db.prepare('UPDATE leads SET assigned_contractor_id = NULL WHERE assigned_contractor_id = $1').run(req.params.id);
  await db.prepare('UPDATE round_robin_state SET last_contractor_id = NULL WHERE last_contractor_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM appointments WHERE contractor_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM availability_slots WHERE contractor_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM contractors WHERE id = $1').run(req.params.id);

  res.json({ message: 'Contractor deleted' });
});

module.exports = router;
