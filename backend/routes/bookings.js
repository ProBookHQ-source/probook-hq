const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireContractor, requireAdmin } = require('../middleware/auth');
const googleCalendar  = require('../services/googleCalendar');
const notifications   = require('../services/notifications');
const { logEvent }    = require('../services/auditLog');

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
    SELECT a.*,
           l.name as lead_name, l.email as lead_email, l.phone as lead_phone,
           l.description as lead_description,
           COALESCE(n.name, cn.name) as niche_name
    FROM appointments a
    LEFT JOIN leads l ON a.lead_id = l.id
    LEFT JOIN niches n ON l.niche_id = n.id
    LEFT JOIN contractors c ON a.contractor_id = c.id
    LEFT JOIN niches cn ON c.niche_id = cn.id
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
    LEFT JOIN leads l ON a.lead_id = l.id
    LEFT JOIN contractors c ON a.contractor_id = c.id
    LEFT JOIN niches n ON l.niche_id = n.id
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

  // ── 1. Validate token ──────────────────────────────────────────────────────
  const bookingToken = await db.prepare(`
    SELECT * FROM booking_tokens WHERE token = $1 AND used = 0 AND expires_at > NOW()
  `).get(token);
  if (!bookingToken) {
    return res.status(400).json({ error: 'Invalid or expired booking link' });
  }

  // ── 2. Validate lead exists and hasn't already been booked ─────────────────
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(bookingToken.lead_id);
  if (!lead || !lead.assigned_contractor_id) {
    return res.status(400).json({ error: 'Lead not ready for booking' });
  }
  if (lead.status === 'booked') {
    return res.status(409).json({ error: 'This appointment has already been booked.' });
  }

  // ── 3. Validate contractor is still active ─────────────────────────────────
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(lead.assigned_contractor_id);
  if (!contractor || !contractor.is_active) {
    return res.status(409).json({ error: 'This contractor is no longer available. Please contact us for a new match.' });
  }

  // ── 4. Validate requested date is not in the past ──────────────────────────
  const now = new Date();
  const requestedDT = new Date(`${date}T${time}:00`);
  if (requestedDT < now) {
    return res.status(400).json({ error: 'Cannot book a time slot in the past.' });
  }

  // ── 5. Re-validate the slot is still within the contractor's availability ──
  const dayOfWeek = requestedDT.getDay();
  const override = await db.prepare(
    'SELECT * FROM availability_overrides WHERE contractor_id = $1 AND date = $2'
  ).get(lead.assigned_contractor_id, date);

  let slotValid = false;
  if (override) {
    if (!override.is_available) {
      return res.status(409).json({ error: 'The contractor is not available on that date. Please pick another time.' });
    }
    // Override with custom hours — normalize to HH:MM (PG may return HH:MM:SS)
    if (override.start_time && override.end_time) {
      const t = time.slice(0, 5);
      slotValid = t >= override.start_time.slice(0, 5) && t < override.end_time.slice(0, 5);
    }
  }

  if (!slotValid) {
    const weeklySlots = await db.prepare(
      'SELECT * FROM availability_slots WHERE contractor_id = $1 AND day_of_week = $2 AND is_active = 1'
    ).all(lead.assigned_contractor_id, dayOfWeek);
    const t = time.slice(0, 5);
    slotValid = weeklySlots.some(s => t >= s.start_time.slice(0, 5) && t < s.end_time.slice(0, 5));
  }

  if (!slotValid) {
    return res.status(409).json({ error: 'That time is no longer in the contractor\'s schedule. Please pick another time.' });
  }

  // ── 6a. Check daily max (if contractor has one set) ───────────────────────────
  if (contractor.max_appointments_per_day) {
    const { rows: countRows } = await db.query(`
      SELECT COUNT(*) AS cnt FROM appointments
      WHERE contractor_id = $1 AND scheduled_date = $2 AND status NOT IN ('cancelled')
    `, [lead.assigned_contractor_id, date]);
    if (parseInt(countRows[0].cnt) >= contractor.max_appointments_per_day) {
      return res.status(409).json({ error: 'The contractor is fully booked on that day. Please pick another date.' });
    }
  }

  // ── 6b. Check for conflicts (also caught by DB unique index as a safety net) ─
  const conflict = await db.prepare(`
    SELECT id FROM appointments
    WHERE contractor_id = $1 AND scheduled_date = $2 AND scheduled_time = $3
    AND status NOT IN ('cancelled')
  `).get(lead.assigned_contractor_id, date, time);
  if (conflict) {
    return res.status(409).json({ error: 'That time slot was just taken. Please pick another.' });
  }

  // ── 7. Create appointment inside a transaction ─────────────────────────────
  const appointmentId  = uuidv4();
  const cancelToken    = uuidv4();
  const rescheduleToken = uuidv4();
  try {
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO appointments (id, lead_id, contractor_id, scheduled_date, scheduled_time, status, cancel_token, reschedule_token)
         VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7)`,
        [appointmentId, lead.id, lead.assigned_contractor_id, date, time, cancelToken, rescheduleToken]
      );
      await client.query('UPDATE booking_tokens SET used = 1 WHERE id = $1', [bookingToken.id]);
      await client.query("UPDATE leads SET status = 'booked' WHERE id = $1", [lead.id]);
    });
  } catch (err) {
    // Unique constraint violation = race condition — someone else just grabbed this slot
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That time slot was just taken. Please pick another.' });
    }
    throw err;
  }

  if (contractor.google_refresh_token) {
    googleCalendar.createEvent(contractor, lead, date, time).then(eventId => {
      if (eventId) db.prepare('UPDATE appointments SET google_event_id = $1 WHERE id = $2').run(eventId, appointmentId);
    }).catch(console.error);
  }

  logEvent(lead.id, 'booked', 'homeowner', `Booked ${date} at ${time} with contractor ${lead.assigned_contractor_id}`);

  res.status(201).json({
    appointment_id: appointmentId, date, time,
    message: 'Appointment confirmed! You will receive a confirmation email shortly.',
  });

  notifications.sendAppointmentConfirmation(lead, contractor, {
    scheduled_date: date, scheduled_time: time,
    cancel_token: cancelToken, reschedule_token: rescheduleToken,
    is_reschedule: bookingToken.source === 'reschedule',
  }).catch(err => console.error('Confirmation email error:', err.message));
});

// ── Direct booking (personal booking pages — no lead/token required) ─────────
// Used by tractifyhq.com/schedule/:slug — prospect books a call directly with a contractor.
router.post('/book-direct', async (req, res) => {
  const { contractor_id, name, email, phone, date, time, notes } = req.body;
  if (!contractor_id || !name || !email || !date || !time) {
    return res.status(400).json({ error: 'contractor_id, name, email, date, and time are required' });
  }

  // ── 1. Validate contractor ────────────────────────────────────────────────
  const contractor = await db.prepare(
    'SELECT * FROM contractors WHERE id = $1 AND is_active = 1'
  ).get(contractor_id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  // ── 2. Validate slot is not in the past ───────────────────────────────────
  const now = new Date();
  const requestedDT = new Date(`${date}T${time}:00`);
  if (requestedDT < now) {
    return res.status(400).json({ error: 'Cannot book a time slot in the past.' });
  }

  // ── 3. Validate slot is within contractor's availability ──────────────────
  const dayOfWeek = requestedDT.getDay();
  const override = await db.prepare(
    'SELECT * FROM availability_overrides WHERE contractor_id = $1 AND date = $2'
  ).get(contractor_id, date);

  let slotValid = false;
  if (override) {
    if (!override.is_available) {
      return res.status(409).json({ error: 'No availability on that date. Please pick another.' });
    }
    if (override.start_time && override.end_time) {
      const t = time.slice(0, 5);
      slotValid = t >= override.start_time.slice(0, 5) && t < override.end_time.slice(0, 5);
    }
  }
  if (!slotValid) {
    const weeklySlots = await db.prepare(
      'SELECT * FROM availability_slots WHERE contractor_id = $1 AND day_of_week = $2 AND is_active = 1'
    ).all(contractor_id, dayOfWeek);
    const t = time.slice(0, 5);
    slotValid = weeklySlots.some(s => t >= s.start_time.slice(0, 5) && t < s.end_time.slice(0, 5));
  }
  if (!slotValid) {
    return res.status(409).json({ error: 'That time is no longer available. Please pick another.' });
  }

  // ── 4. Check daily max ────────────────────────────────────────────────────
  if (contractor.max_appointments_per_day) {
    const { rows: countRows } = await db.query(`
      SELECT COUNT(*) AS cnt FROM appointments
      WHERE contractor_id = $1 AND scheduled_date = $2 AND status NOT IN ('cancelled')
    `, [contractor_id, date]);
    if (parseInt(countRows[0].cnt) >= contractor.max_appointments_per_day) {
      return res.status(409).json({ error: 'Fully booked that day. Please pick another date.' });
    }
  }

  // ── 5. Check for conflicts ────────────────────────────────────────────────
  const conflict = await db.prepare(`
    SELECT id FROM appointments
    WHERE contractor_id = $1 AND scheduled_date = $2 AND scheduled_time = $3
    AND status NOT IN ('cancelled')
  `).get(contractor_id, date, time);
  if (conflict) {
    return res.status(409).json({ error: 'That time slot was just taken. Please pick another.' });
  }

  // ── 6. Create appointment (lead_id = NULL — direct booking, not a lead) ───
  const appointmentId = uuidv4();
  const contactInfo = JSON.stringify({ name, email, phone: phone || '', notes: notes || '' });
  try {
    await db.query(
      `INSERT INTO appointments (id, lead_id, contractor_id, scheduled_date, scheduled_time, status, notes)
       VALUES ($1, NULL, $2, $3, $4, 'confirmed', $5)`,
      [appointmentId, contractor_id, date, time, contactInfo]
    );
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That time slot was just taken. Please pick another.' });
    }
    throw err;
  }

  // ── 7. Send email notifications ───────────────────────────────────────────
  const FRONTEND_URL = process.env.FRONTEND_URL || 'https://tractifyhq.com';
  const BRAND_NAME   = process.env.BRAND_NAME   || 'Tractify';
  const FROM_EMAIL   = process.env.FROM_EMAIL    || 'bookings@tractifyhq.com';
  const RESEND_KEY   = process.env.RESEND_API_KEY;

  const fmtDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const fmtTime = (() => {
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  })();

  const sendEmail = async (to, subject, html) => {
    if (!RESEND_KEY) return;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({ from: `${BRAND_NAME} <${FROM_EMAIL}>`, to, subject, html }),
    });
  };

  // Confirmation to prospect
  sendEmail(email, `Your call with ${contractor.name || contractor.company_name} is confirmed`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#6366f1;padding:24px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;color:#fff;font-size:22px">${BRAND_NAME}</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 8px">You're booked, ${name.split(' ')[0]}! 🎉</h2>
        <p style="color:#6b7280;margin:0 0 24px">Here are your call details:</p>
        <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px">
          <p style="margin:0 0 8px"><strong>📅 Date:</strong> ${fmtDate}</p>
          <p style="margin:0 0 8px"><strong>🕐 Time:</strong> ${fmtTime}</p>
          <p style="margin:0"><strong>👤 With:</strong> ${contractor.name}${contractor.company_name ? ` — ${contractor.company_name}` : ''}</p>
        </div>
        <p style="color:#6b7280;font-size:14px">We'll reach out on the day of your call. See you then!</p>
      </div>
    </div>
  `).catch(console.error);

  // Notification to contractor
  sendEmail(contractor.email, `New booking: ${name} — ${fmtDate} at ${fmtTime}`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#6366f1;padding:24px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;color:#fff;font-size:22px">${BRAND_NAME}</h1>
      </div>
      <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 8px">New booking on your calendar</h2>
        <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px">
          <p style="margin:0 0 8px"><strong>👤 Name:</strong> ${name}</p>
          <p style="margin:0 0 8px"><strong>📧 Email:</strong> ${email}</p>
          ${phone ? `<p style="margin:0 0 8px"><strong>📞 Phone:</strong> ${phone}</p>` : ''}
          ${notes ? `<p style="margin:0 0 8px"><strong>📝 Notes:</strong> ${notes}</p>` : ''}
          <p style="margin:0 0 8px"><strong>📅 Date:</strong> ${fmtDate}</p>
          <p style="margin:0"><strong>🕐 Time:</strong> ${fmtTime}</p>
        </div>
        <p style="color:#6b7280;font-size:14px">View all appointments in your <a href="${FRONTEND_URL}/contractor" style="color:#6366f1">Tractify portal</a>.</p>
      </div>
    </div>
  `).catch(console.error);

  res.status(201).json({
    appointment_id: appointmentId,
    date, time,
    message: 'Booking confirmed! Check your email for details.',
  });
});

// ── Self-service: get cancel info (public) ────────────────────────────────────
router.get('/cancel-info/:token', async (req, res) => {
  const appt = await db.prepare(`
    SELECT a.id, a.scheduled_date, a.scheduled_time, a.status,
           l.name AS lead_name, c.name AS contractor_name, c.company_name
    FROM appointments a
    JOIN leads l ON a.lead_id = l.id
    JOIN contractors c ON a.contractor_id = c.id
    WHERE a.cancel_token = $1
  `).get(req.params.token);
  if (!appt) return res.status(404).json({ error: 'Invalid or expired cancellation link.' });
  if (appt.status === 'cancelled') return res.status(410).json({ error: 'This appointment has already been cancelled.' });
  if (appt.status === 'completed') return res.status(410).json({ error: 'This appointment has already been completed.' });
  res.json({
    lead_name:       appt.lead_name,
    contractor_name: appt.company_name || appt.contractor_name,
    scheduled_date:  appt.scheduled_date,
    scheduled_time:  appt.scheduled_time,
  });
});

// ── Self-service: confirm cancellation (public) ───────────────────────────────
router.post('/cancel-token/:token', async (req, res) => {
  const appt = await db.prepare(`
    SELECT a.*, l.name AS lead_name, l.email AS lead_email,
           c.name AS contractor_name, c.company_name, c.email AS contractor_email
    FROM appointments a
    JOIN leads l ON a.lead_id = l.id
    JOIN contractors c ON a.contractor_id = c.id
    WHERE a.cancel_token = $1
  `).get(req.params.token);
  if (!appt) return res.status(404).json({ error: 'Invalid or expired cancellation link.' });
  if (appt.status === 'cancelled') return res.status(410).json({ error: 'This appointment has already been cancelled.' });
  if (appt.status === 'completed') return res.status(410).json({ error: 'This appointment has already been completed.' });

  await db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1").run(appt.id);
  await db.prepare("UPDATE leads SET status = 'matched' WHERE id = $1").run(appt.lead_id);
  logEvent(appt.lead_id, 'cancelled', 'homeowner', 'Appointment cancelled by homeowner via email link');

  const lead       = await db.prepare('SELECT * FROM leads WHERE id = $1').get(appt.lead_id);
  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(appt.contractor_id);
  if (lead && contractor) {
    // Always notify the contractor — they need to know regardless of the homeowner's limit
    notifications.sendHomeownerCancelledNotice(contractor, lead, appt).catch(console.error);

    const hitLimit = (lead.reschedule_count || 0) >= 1;
    if (hitLimit) {
      // Too many self-service actions — alert admin, don't auto-issue rebook link
      notifications.sendAdminNoMatch({ ...lead, description: `[ABUSE FLAG] Homeowner attempted a 2nd self-service cancellation. Manual review needed.` }).catch(console.error);
      return res.json({ message: 'Your appointment has been cancelled. Please contact bookings@tractifyhq.com to arrange a new time.', limit_reached: true });
    }
    await db.prepare('UPDATE leads SET reschedule_count = COALESCE(reschedule_count, 0) + 1 WHERE id = $1').run(lead.id);
    await db.prepare('UPDATE booking_tokens SET used = 1 WHERE lead_id = $1 AND used = 0').run(lead.id);
    const newToken  = uuidv4();
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
    await db.prepare('INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)')
      .run(uuidv4(), lead.id, newToken, expiresAt);
    const bookingUrl = `${process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app'}/book/${newToken}`;
    notifications.sendHomeownerRebookLink(lead, contractor, bookingUrl).catch(console.error);
  }
  res.json({ message: 'Appointment cancelled. A new booking link has been sent to your email.' });
});

// ── Self-service: get reschedule info (public) ────────────────────────────────
router.get('/reschedule-info/:token', async (req, res) => {
  const appt = await db.prepare(`
    SELECT a.id, a.scheduled_date, a.scheduled_time, a.status,
           l.name AS lead_name, c.name AS contractor_name, c.company_name
    FROM appointments a
    JOIN leads l ON a.lead_id = l.id
    JOIN contractors c ON a.contractor_id = c.id
    WHERE a.reschedule_token = $1
  `).get(req.params.token);
  if (!appt) return res.status(404).json({ error: 'Invalid or expired reschedule link.' });
  if (appt.status === 'cancelled') return res.status(410).json({ error: 'This appointment has already been cancelled.' });
  if (appt.status === 'completed') return res.status(410).json({ error: 'This appointment has already been completed.' });
  res.json({
    lead_name:       appt.lead_name,
    contractor_name: appt.company_name || appt.contractor_name,
    scheduled_date:  appt.scheduled_date,
    scheduled_time:  appt.scheduled_time,
  });
});

// ── Self-service: confirm reschedule (public) ─────────────────────────────────
router.post('/reschedule-token/:token', async (req, res) => {
  const appt = await db.prepare(`
    SELECT a.*, l.name AS lead_name, l.email AS lead_email,
           c.name AS contractor_name, c.company_name
    FROM appointments a
    JOIN leads l ON a.lead_id = l.id
    JOIN contractors c ON a.contractor_id = c.id
    WHERE a.reschedule_token = $1
  `).get(req.params.token);
  if (!appt) return res.status(404).json({ error: 'Invalid or expired reschedule link.' });
  if (appt.status === 'cancelled') return res.status(410).json({ error: 'This appointment has already been cancelled.' });
  if (appt.status === 'completed') return res.status(410).json({ error: 'This appointment has already been completed.' });

  // ── Check abuse limit BEFORE cancelling so the appointment isn't wiped on a 2nd attempt
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(appt.lead_id);
  const hitLimit = (lead.reschedule_count || 0) >= 1;
  if (hitLimit) {
    notifications.sendAdminNoMatch({ ...lead, description: `[ABUSE FLAG] Homeowner attempted a 2nd self-service reschedule. Manual review needed.` }).catch(console.error);
    return res.status(429).json({ error: 'You\'ve used your self-service reschedule. Please contact bookings@tractifyhq.com to arrange a new time.' });
  }

  await db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1").run(appt.id);
  await db.prepare("UPDATE leads SET status = 'matched' WHERE id = $1").run(appt.lead_id);
  logEvent(appt.lead_id, 'reschedule_requested', 'homeowner', 'Homeowner requested reschedule via email link');

  await db.prepare('UPDATE leads SET reschedule_count = COALESCE(reschedule_count, 0) + 1 WHERE id = $1').run(lead.id);
  await db.prepare('UPDATE booking_tokens SET used = 1 WHERE lead_id = $1 AND used = 0').run(lead.id);
  const newToken  = uuidv4();
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
  await db.prepare('INSERT INTO booking_tokens (id, lead_id, token, expires_at, source) VALUES ($1, $2, $3, $4, $5)')
    .run(uuidv4(), lead.id, newToken, expiresAt, 'reschedule');

  res.json({ booking_token: newToken });
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
  if (appt.lead_id) logEvent(appt.lead_id, 'cancelled', 'contractor', `Appointment ${id} cancelled by contractor`);

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
  if (appt.lead_id) logEvent(appt.lead_id, 'completed', 'contractor', `Appointment ${id} marked complete`);
  res.json({ message: 'Appointment marked complete' });
});

// ── Admin cancel ──────────────────────────────────────────────────────────────
router.put('/:id/admin-cancel', requireAdmin, async (req, res) => {
  const appt = await db.prepare('SELECT * FROM appointments WHERE id = $1').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  await db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1").run(req.params.id);

  // Only send rebook flow for real Tractify appointments (not external blocks)
  if (appt.lead_id) {
    await db.prepare("UPDATE leads SET status = 'matched' WHERE id = $1").run(appt.lead_id);

    const lead       = await db.prepare('SELECT * FROM leads WHERE id = $1').get(appt.lead_id);
    const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(appt.contractor_id);
    if (lead && contractor) {
      const { v4: uuidv4 } = require('uuid');
      await db.prepare('UPDATE booking_tokens SET used = 1 WHERE lead_id = $1 AND used = 0').run(lead.id);
      const newToken   = uuidv4();
      const expiresAt  = new Date(Date.now() + 24 * 3600 * 1000);
      await db.prepare('INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)')
        .run(uuidv4(), lead.id, newToken, expiresAt);
      const bookingUrl = `${process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app'}/book/${newToken}`;
      notifications.sendCancellationAndRebook(lead, contractor, bookingUrl).catch(console.error);
    }
  }

  res.json({ message: 'Appointment cancelled' });
});

// ── Admin delete appointment ─────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  const appt = await db.prepare('SELECT * FROM appointments WHERE id = $1').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  await db.prepare('DELETE FROM appointments WHERE id = $1').run(req.params.id);
  res.json({ message: 'Appointment deleted' });
});

// ── Admin complete ────────────────────────────────────────────────────────────
router.put('/:id/admin-complete', requireAdmin, async (req, res) => {
  const appt = await db.prepare('SELECT * FROM appointments WHERE id = $1').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  await db.prepare("UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1").run(req.params.id);
  await db.prepare("UPDATE leads SET status = 'completed' WHERE id = $1").run(appt.lead_id);
  if (appt.lead_id) logEvent(appt.lead_id, 'completed', 'admin', `Appointment ${req.params.id} marked complete by admin`);
  res.json({ message: 'Appointment marked complete' });
});

module.exports = router;
