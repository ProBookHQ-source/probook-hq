const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireContractor, requireAdmin } = require('../middleware/auth');
const googleCalendar  = require('../services/googleCalendar');
const notifications   = require('../services/notifications');

const router = express.Router();

// ── Validate a booking token ──────────────────────────────────────────────────
router.get('/validate-token/:token', async (req, res) => {
  const { token } = req.params;
  const bookingToken = await db.prepare(`
    SELECT bt.*, l.name as lead_name, l.email as lead_email,
           l.assigned_contractor_id as contractor_id,
           c.name as contractor_name, c.company_name as contractor_company
    FROM booking_tokens bt
    JOIN leads l ON bt.lead_id = l.id
    LEFT JOIN contractors c ON l.assigned_contractor_id = c.id
    WHERE bt.token = $1 AND bt.used = 0 AND bt.expires_at > NOW()
  `).get(token);

  if (!bookingToken) {
    return res.status(400).json({ error: 'Invalid or expired booking link' });
  }
  res.json({
    lead_name:           bookingToken.lead_name,
    lead_email:          bookingToken.lead_email,
    contractor_id:       bookingToken.contractor_id,
    contractor_name:     bookingToken.contractor_name,
    contractor_company:  bookingToken.contractor_company,
  });
});

// ── List appointments for a contractor ───────────────────────────────────────
router.get('/contractor/:contractorId', requireContractor, async (req, res) => {
  const { contractorId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { from, to } = req.query;
  let query = `
    SELECT a.*, l.name as lead_name, l.email as lead_email, l.phone as lead_phone,
           l.description as lead_description, n.name as niche_name
    FROM appointments a
    JOIN leads l ON a.lead_id = l.id
    JOIN niches n ON l.niche_id = n.id
    WHERE a.contractor_id = $1
  `;
  const params = [contractorId];
  if (from) { query += ` AND a.scheduled_date >= $${params.length + 1}`; params.push(from); }
  if (to)   { query += ` AND a.scheduled_date <= $${params.length + 1}`; params.push(to); }
  query += ' ORDER BY a.scheduled_date, a.scheduled_time';

  const { rows } = await db.query(query, params);
  res.json(rows);
});

// ── List all appointments (admin) ─────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  const { status, from, to } = req.query;
  let query = `
    SELECT a.*, l.name as lead_name, l.email as lead_email,
           c.name as contractor_name, c.company_name, n.name as niche_name
    FROM appointments a
    JOIN leads l ON a.lead_id = l.id
    JOIN contractors c ON a.contractor_id = c.id
    JOIN niches n ON l.niche_id = n.id
  `;
  const params = [];
  const conditions = [];
  if (status) { conditions.push(`a.status = $${params.length + 1}`);         params.push(status); }
  if (from)   { conditions.push(`a.scheduled_date >= $${params.length + 1}`); params.push(from); }
  if (to)     { conditions.push(`a.scheduled_date <= $${params.length + 1}`); params.push(to); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY a.scheduled_date DESC, a.scheduled_time';

  const { rows } = await db.query(query, params);
  res.json(rows);
});

// ── Book a slot ───────────────────────────────────────────────────────────────
router.post('/book', async (req, res) => {
  const { token, date, time } = req.body;
  if (!token || !date || !time) {
    return res.status(400).json({ error: 'token, date, and time are required' });
  }

  const bookingToken = await db.prepare(`
    SELECT * FROM booking_tokens WHERE token = $1 AND used = 0 AND expires_at > NOW()
  `).get(token);
  if (!bookingToken) {
    return res.status(400).json({ error: 'Invalid or expired booking link' });
  }

  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(bookingToken.lead_id);
  if (!lead || !lead.assigned_contractor_id) {
    return res.status(400).json({ error: 'Lead not ready for booking' });
  }

  const conflict = await db.prepare(`
    SELECT id FROM appointments
    WHERE contractor_id = $1 AND scheduled_date = $2 AND scheduled_time = $3
    AND status NOT IN ('cancelled')
  `).get(lead.assigned_contractor_id, date, time);
  if (conflict) {
    return res.status(409).json({ error: 'That time slot is no longer available. Please pick another.' });
  }

  const appointmentId = uuidv4();
  await db.prepare(`
    INSERT INTO appointments (id, lead_id, contractor_id, scheduled_date, scheduled_time, status)
    VALUES ($1, $2, $3, $4, $5, 'confirmed')
  `).run(appointmentId, lead.id, lead.assigned_contractor_id, date, time);

  await db.prepare('UPDATE booking_tokens SET used = 1 WHERE id = $1').run(bookingToken.id);
  await db.prepare("UPDATE leads SET status = 'booked' WHERE id = $1").run(lead.id);

  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(lead.assigned_contractor_id);

  if (contractor.google_refresh_token) {
    googleCalendar.createEvent(contractor, lead, date, time).then(eventId => {
      if (eventId) db.prepare('UPDATE appointments SET google_event_id = $1 WHERE id = $2').run(eventId, appointmentId);
    }).catch(console.error);
  }

  res.status(201).json({
    appointment_id: appointmentId, date, time,
    message: 'Appointment confirmed! You will receive a confirmation email shortly.',
  });

  notifications.sendAppointmentConfirmation(lead, contractor, { scheduled_date: date, scheduled_time: time })
    .catch(err => console.error('Confirmation email error:', err.message));
});

// ── Cancel an appointment (contractor) ───────────────────────────────────────
router.put('/:id/cancel', requireContractor, async (req, res) => {
  const { id } = req.params;
  const appt = await db.prepare('SELECT * FROM appointments WHERE id = $1').get(id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  if (req.user.role !== 'admin' && req.user.id !== appt.contractor_id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  await db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1").run(id);
  await db.prepare("UPDATE leads SET status = 'matched' WHERE id = $1").run(appt.lead_id);

  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(appt.contractor_id);
  if (appt.google_event_id && contractor?.google_refresh_token) {
    googleCalendar.deleteEvent(contractor, appt.google_event_id).catch(console.error);
  }

  // Issue a new booking link and notify the homeowner
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(appt.lead_id);
  if (lead && contractor) {
    const { v4: uuidv4 } = require('uuid');
    await db.prepare('UPDATE booking_tokens SET used = 1 WHERE lead_id = $1 AND used = 0').run(lead.id);
    const newToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    await db.prepare('INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)')
      .run(uuidv4(), lead.id, newToken, expiresAt);
    const bookingUrl = `${process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app'}/book/${newToken}`;
    notifications.sendCancellationAndRebook(lead, contractor, bookingUrl).catch(console.error);
  }

  res.json({ message: 'Appointment cancelled' });
});

// ── Complete an appointment (contractor) ──────────────────────────────────────
router.put('/:id/complete', requireContractor, async (req, res) => {
  const { id } = req.params;
  const appt = await db.prepare('SELECT * FROM appointments WHERE id = $1').get(id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  if (req.user.role !== 'admin' && req.user.id !== appt.contractor_id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  await db.prepare("UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1").run(id);
  await db.prepare("UPDATE leads SET status = 'completed' WHERE id = $1").run(appt.lead_id);
  res.json({ message: 'Appointment marked complete' });
});

// ── Admin cancel ──────────────────────────────────────────────────────────────
router.put('/:id/admin-cancel', requireAdmin, async (req, res) => {
  const appt = await db.prepare('SELECT * FROM appointments WHERE id = $1').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  await db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1").run(req.params.id);
  await db.prepare("UPDATE leads SET status = 'matched' WHERE id = $1").run(appt.lead_id);
  res.json({ message: 'Appointment cancelled' });
});

// ── Admin complete ────────────────────────────────────────────────────────────
router.put('/:id/admin-complete', requireAdmin, async (req, res) => {
  const appt = await db.prepare('SELECT * FROM appointments WHERE id = $1').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  await db.prepare("UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1").run(req.params.id);
  await db.prepare("UPDATE leads SET status = 'completed' WHERE id = $1").run(appt.lead_id);
  res.json({ message: 'Appointment marked complete' });
});

module.exports = router;
