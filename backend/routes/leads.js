const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const matchingEngine = require('../services/matchingEngine');
const { sendAdminNoMatch } = require('../services/notifications');

const router = express.Router();

// ── Get niches (public — must be above /:id so Express doesn't treat "meta" as an id)
router.get('/meta/niches', async (req, res) => {
  const niches = await db.prepare('SELECT id, name, description FROM niches ORDER BY name').all();
  res.json(niches);
});

// ── List all leads (admin) ────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
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
  if (status)   { conditions.push(`l.status = $${params.length + 1}`);   params.push(status); }
  if (niche_id) { conditions.push(`l.niche_id = $${params.length + 1}`); params.push(niche_id); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY l.created_at DESC';

  const { rows } = await db.query(query, params);
  res.json(rows);
});

// ── Get single lead ───────────────────────────────────────────────────────────
router.get('/:id', requireAdmin, async (req, res) => {
  const lead = await db.prepare(`
    SELECT l.*, n.name as niche_name, c.name as contractor_name
    FROM leads l
    LEFT JOIN niches n ON l.niche_id = n.id
    LEFT JOIN contractors c ON l.assigned_contractor_id = c.id
    WHERE l.id = $1
  `).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// ── Create a new lead (public) ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, email, phone, niche_id, zip_code, description } = req.body;
  if (!name || !email || !niche_id || !zip_code) {
    return res.status(400).json({ error: 'name, email, niche_id, and zip_code are required' });
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  // Cap description length
  if (description && description.length > 2000) {
    return res.status(400).json({ error: 'Description must be 2000 characters or fewer' });
  }

  const niche = await db.prepare('SELECT id FROM niches WHERE id = $1').get(niche_id);
  if (!niche) return res.status(400).json({ error: 'Invalid niche_id' });

  const id = uuidv4();
  try {
    await db.prepare(`
      INSERT INTO leads (id, name, email, phone, niche_id, zip_code, description, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
    `).run(id, name, email, phone || null, niche_id, zip_code, description || null);
  } catch (err) {
    console.error('Lead insert error:', err);
    return res.status(500).json({ error: 'Failed to create lead' });
  }

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

  if (matched) {
    matchingEngine.sendMatchNotifications(id).catch(err =>
      console.error('Notification error:', err)
    );
  } else {
    // Alert admin so no lead falls through the cracks
    const leadForNotif = await db.prepare('SELECT * FROM leads WHERE id = $1').get(id);
    if (leadForNotif) {
      sendAdminNoMatch(leadForNotif).catch(err =>
        console.error('Admin no-match notification error:', err)
      );
    }
  }
});

// ── Update lead (admin) ───────────────────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const { status, assigned_contractor_id } = req.body;
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  await db.prepare(`
    UPDATE leads SET
      status = COALESCE($1, status),
      assigned_contractor_id = COALESCE($2, assigned_contractor_id)
    WHERE id = $3
  `).run(status || null, assigned_contractor_id || null, req.params.id);
  res.json({ message: 'Lead updated' });
});

// ── Manually trigger matching (admin) ─────────────────────────────────────────
router.post('/:id/match', requireAdmin, async (req, res) => {
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const matched = await matchingEngine.matchAndNotify(lead.id);
  res.json({ matched, message: matched ? 'Contractor matched and notified' : 'No available contractors found' });
});

// ── Resend booking link (admin) ───────────────────────────────────────────────
router.post('/:id/resend-link', requireAdmin, async (req, res) => {
  const lead = await db.prepare(`
    SELECT l.*, n.name as niche_name FROM leads l
    JOIN niches n ON l.niche_id = n.id WHERE l.id = $1
  `).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!lead.assigned_contractor_id) return res.status(400).json({ error: 'Lead has no assigned contractor' });

  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(lead.assigned_contractor_id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  // Expire old tokens
  await db.prepare('UPDATE booking_tokens SET used = 1 WHERE lead_id = $1 AND used = 0').run(lead.id);

  // Create new token (24 hr)
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await db.prepare('INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)')
    .run(uuidv4(), lead.id, token, expiresAt);

  // Ensure lead status is matched
  await db.prepare("UPDATE leads SET status = 'matched' WHERE id = $1").run(lead.id);

  const { sendBookingLink } = require('../services/notifications');
  const bookingUrl = `${process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app'}/book/${token}`;
  await sendBookingLink(lead, contractor, bookingUrl);

  res.json({ message: 'Booking link resent' });
});

// ── Delete lead (admin) ───────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  // Delete related records first (FK constraints)
  await db.prepare('DELETE FROM booking_tokens WHERE lead_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM appointments WHERE lead_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM leads WHERE id = $1').run(req.params.id);

  res.json({ message: 'Lead deleted' });
});

module.exports = router;
