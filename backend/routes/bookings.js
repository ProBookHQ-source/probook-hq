const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireContractor, requireAdmin } = require('../middleware/auth');
const googleCalendar = require('../services/googleCalendar');
const notifications = require('../services/notifications');

const router = express.Router();

// ── Validate a booking token (called by BookingFlow page) ────────────────────
router.get('/validate-token/:token', (req, res) => {
  const { token } = req.params;
  const bookingToken = db.prepare(`
    SELECT bt.*, l.name as lead_name, l.email as lead_email,
           l.assigned_contractor_id as contractor_id,
           c.name as contractor_name, c.company_name as contractor_company
    FROM booking_tokens bt
    JOIN leads l ON bt.lead_id = l.id
    LEFT JOIN contractors c ON l.assigned_contractor_id = c.id
    WHERE bt.token = ? AND bt.used = 0 AND bt.expires_at > datetime('now')
  `).get(token);

  if (!bookingToken) {
    return res.status(400).json({ error: 'Invalid or expired booking link' });
  }
  res.json({
    lead_name: bookingToken.lead_name,
    lead_email: bookingToken.lead_email,
    contractor_id: bookingToken.contractor_id,
    contractor_name: bookingToken.contractor_name,
    contractor_company: bookingToken.contractor_company,
  });
});

// ── List appointments for a contractor ───────────────────────────────────────
router.get('/contractor/:contractorId', requireContractor, (req, res) => {
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
    WHERE a.contractor_id = ?
  `;
  const params = [contractorId];
  if (from) { query += ' AND a.scheduled_date >= ?'; params.push(from); }
  if (to)   { query += ' AND a.scheduled_date <= ?'; params.push(to); }
  query += ' ORDER BY a.scheduled_date, a.scheduled_time';
  res.json(db.prepare(query).all(...params));
});

// ── List all appointments (admin) ────────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
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
  if (status) { conditions.push('a.status = ?'); params.push(status); }
  if (from)   { conditions.push('a.scheduled_date >= ?'); params.push(from); }
  if (to)     { conditions.push('a.scheduled_date <= ?'); params.push(to); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY a.scheduled_date DESC, a.scheduled_time';
  res.json(db.prepare(query).all(...params));
});

// ── Book a slot (homeowner via booking token) ────────────────────────────────
router.post('/book', async (req, res) => {
  const { token, date, time } = req.body;
  if (!token || !date || !time) {
    return res.status(400).json({ error: 'token, date, and time are required' });
  }

  // Validate token
  const bookingToken = db.prepare(`
    SELECT * FROM booking_tokens WHERE token = ? AND used = 0 AND expires_at > datetime('now')
  `).get(token);
  if (!bookingToken) {
    return res.status(400).json({ error: 'Invalid or expired booking link' });
  }

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(bookingToken.lead_id);
  if (!lead || !lead.assigned_contractor_id) {
    return res.status(400).json({ error: 'Lead not ready for booking' });
  }

  // Check slot is still open
  const conflict = db.prepare(`
    SELECT id FROM appointments
    WHERE contractor_id = ? AND scheduled_date = ? AND scheduled_time = ?
    AND status NOT IN ('cancelled')
  `).get(lead.assigned_contractor_id, date, time);
  if (conflict) {
    return res.status(409).json({ error: 'That time slot is no longer available. Please pick another.' });
  }

  // Create appointment
  const appointmentId = uuidv4();
  db.prepare(`
    INSERT INTO appointments (id, lead_id, contractor_id, scheduled_date, scheduled_time, status)
    VALUES (?, ?, ?, ?, ?, 'confirmed')
  `).run(appointmentId, lead.id, lead.assigned_contractor_id, date, time);

  // Mark token used + lead as booked
  db.prepare('UPDATE booking_tokens SET used = 1 WHERE id = ?').run(bookingToken.id);
  db.prepare("UPDATE leads SET status = 'booked' WHERE id = ?").run(lead.id);

  // Sync to Google Calendar (non-blocking)
  const contractor = db.prepare('SELECT * FROM contractors WHERE id = ?').get(lead.assigned_contractor_id);
  if (contractor.google_refresh_token) {
    googleCalendar.createEvent(contractor, lead, date, time).then(eventId => {
      if (eventId) {
        db.prepare('UPDATE appointments SET google_event_id = ? WHERE id = ?').run(eventId, appointmentId);
      }
    }).catch(console.error);
  }

  res.status(201).json({
    appointment_id: appointmentId,
    date,
    time,
    message: 'Appointment confirmed! You will receive a confirmation email shortly.',
  });

  // Send confirmation emails after responding (non-blocking)
  const appointment = { scheduled_date: date, scheduled_time: time };
  notifications.sendAppointmentConfirmation(lead, contractor, appointment)
    .catch(err => console.error('Confirmation email error:', err.message));
});

// ── Cancel an appointment ────────────────────────────────────────────────────
router.put('/:id/cancel', requireContractor, async (req, res) => {
  const { id } = req.params;
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  if (req.user.role !== 'admin' && req.user.id !== appt.contractor_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(id);
  db.prepare("UPDATE leads SET status = 'new' WHERE id = ?").run(appt.lead_id);

  // Remove from Google Calendar
  const contractor = db.prepare('SELECT * FROM contractors WHERE id = ?').get(appt.contractor_id);
  if (appt.google_event_id && contractor.google_refresh_token) {
    googleCalendar.deleteEvent(contractor, appt.google_event_id).catch(console.error);
  }

  res.json({ message: 'Appointment cancelled' });
});

// ── Complete an appointment ──────────────────────────────────────────────────
router.put('/:id/complete', requireContractor, (req, res) => {
  const { id } = req.params;
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  if (req.user.role !== 'admin' && req.user.id !== appt.contractor_id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  db.prepare("UPDATE appointments SET status = 'completed', updated_at = datetime('now') WHERE id = ?").run(id);
  db.prepare("UPDATE leads SET status = 'completed' WHERE id = ?").run(appt.lead_id);
  res.json({ message: 'Appointment marked complete' });
});

module.exports = router;
