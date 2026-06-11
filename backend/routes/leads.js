const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const matchingEngine = require('../services/matchingEngine');

const router = express.Router();

// ── List all leads (admin) ───────────────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
  const { status, niche_id } = req.query;
  let query = `
    SELECT l.*, n.name as niche_name,
           c.name as contractor_name, c.company_name as contractor_company
    FROM leads l
    LEFT JOIN niches n ON l.niche_id = n.id
    LEFT JOIN contractors c ON l.assigned_contractor_id = c.id
  `;
  const params = [];
  const conditions = [];
  if (status) { conditions.push('l.status = ?'); params.push(status); }
  if (niche_id) { conditions.push('l.niche_id = ?'); params.push(niche_id); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY l.created_at DESC';

  res.json(db.prepare(query).all(...params));
});

// ── Get single lead ──────────────────────────────────────────────────────────
router.get('/:id', requireAdmin, (req, res) => {
  const lead = db.prepare(`
    SELECT l.*, n.name as niche_name,
           c.name as contractor_name
    FROM leads l
    LEFT JOIN niches n ON l.niche_id = n.id
    LEFT JOIN contractors c ON l.assigned_contractor_id = c.id
    WHERE l.id = ?
  `).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// ── Create a new lead (public endpoint — called from your website widget) ────
router.post('/', async (req, res) => {
  const { name, email, phone, niche_id, zip_code, description } = req.body;
  if (!name || !email || !niche_id || !zip_code) {
    return res.status(400).json({ error: 'name, email, niche_id, and zip_code are required' });
  }

  // Validate niche exists
  const niche = db.prepare('SELECT id FROM niches WHERE id = ?').get(niche_id);
  if (!niche) return res.status(400).json({ error: 'Invalid niche_id' });

  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO leads (id, name, email, phone, niche_id, zip_code, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
    `).run(id, name, email, phone || null, niche_id, zip_code, description || null);
  } catch (err) {
    console.error('Lead insert error:', err);
    return res.status(500).json({ error: 'Failed to create lead' });
  }

  // Match contractor synchronously (fast DB lookup), then respond immediately.
  // Email notifications fire in background — never block the HTTP response.
  let matched = false;
  try {
    matched = await matchingEngine.matchOnly(id);
  } catch (err) {
    console.error('Matching error:', err);
  }

  res.status(201).json({
    id,
    message: matched
      ? 'Lead created and contractor matched. Booking link sent to your email.'
      : 'Lead created. We will contact you shortly.',
    matched,
  });

  // Send emails after responding so the client never waits on SMTP
  if (matched) {
    matchingEngine.sendMatchNotifications(id).catch(err =>
      console.error('Notification error:', err)
    );
  }
});

// ── Update lead status (admin) ───────────────────────────────────────────────
router.put('/:id', requireAdmin, (req, res) => {
  const { status, assigned_contractor_id } = req.body;
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  db.prepare(`
    UPDATE leads SET
      status = COALESCE(?, status),
      assigned_contractor_id = COALESCE(?, assigned_contractor_id)
    WHERE id = ?
  `).run(status || null, assigned_contractor_id || null, req.params.id);
  res.json({ message: 'Lead updated' });
});

// ── Manually trigger matching for a lead (admin) ────────────────────────────
router.post('/:id/match', requireAdmin, async (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  try {
    const matched = await matchingEngine.matchAndNotify(lead.id);
    res.json({ matched, message: matched ? 'Contractor matched and notified' : 'No available contractors found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get niches (public — for lead intake form) ───────────────────────────────
router.get('/meta/niches', (req, res) => {
  res.json(db.prepare('SELECT id, name, description FROM niches ORDER BY name').all());
});

module.exports = router;
