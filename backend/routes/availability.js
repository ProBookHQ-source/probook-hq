const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireContractor } = require('../middleware/auth');

const router = express.Router();

// ── Get contractor's weekly availability ──────────────────────────────────────
router.get('/:contractorId/slots', async (req, res) => {
  const slots = await db.prepare(
    'SELECT * FROM availability_slots WHERE contractor_id = $1 AND is_active = 1 ORDER BY day_of_week, start_time'
  ).all(req.params.contractorId);
  res.json(slots);
});

// ── Set/replace weekly availability ──────────────────────────────────────────
router.put('/:contractorId/slots', requireContractor, async (req, res) => {
  const { contractorId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const slots = req.body;
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'Body must be an array of slots' });

  await db.transaction(async (client) => {
    await client.query('DELETE FROM availability_slots WHERE contractor_id = $1', [contractorId]);
    for (const slot of slots) {
      if (slot.day_of_week === undefined || !slot.start_time || !slot.end_time) continue;
      await client.query(
        'INSERT INTO availability_slots (id, contractor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4, $5)',
        [uuidv4(), contractorId, slot.day_of_week, slot.start_time, slot.end_time]
      );
    }
  });
  res.json({ message: 'Availability updated' });
});

// ── Get overrides ─────────────────────────────────────────────────────────────
router.get('/:contractorId/overrides', async (req, res) => {
  const { contractorId } = req.params;
  const { from, to } = req.query;
  let query = 'SELECT * FROM availability_overrides WHERE contractor_id = $1';
  const params = [contractorId];
  if (from) { query += ` AND date >= $${params.length + 1}`; params.push(from); }
  if (to)   { query += ` AND date <= $${params.length + 1}`; params.push(to); }
  query += ' ORDER BY date';
  const { rows } = await db.query(query, params);
  res.json(rows);
});

// ── Add/update an override ────────────────────────────────────────────────────
router.post('/:contractorId/overrides', requireContractor, async (req, res) => {
  const { contractorId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { date, is_available, start_time, end_time, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const existing = await db.prepare(
    'SELECT id FROM availability_overrides WHERE contractor_id = $1 AND date = $2'
  ).get(contractorId, date);

  if (existing) {
    await db.prepare(`
      UPDATE availability_overrides
      SET is_available = $1, start_time = $2, end_time = $3, reason = $4
      WHERE id = $5
    `).run(is_available ? 1 : 0, start_time || null, end_time || null, reason || null, existing.id);
    res.json({ id: existing.id, message: 'Override updated' });
  } else {
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO availability_overrides (id, contractor_id, date, is_available, start_time, end_time, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `).run(id, contractorId, date, is_available ? 1 : 0, start_time || null, end_time || null, reason || null);
    res.status(201).json({ id, message: 'Override created' });
  }
});

// ── Delete an override ────────────────────────────────────────────────────────
router.delete('/:contractorId/overrides/:overrideId', requireContractor, async (req, res) => {
  const { contractorId, overrideId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  await db.prepare('DELETE FROM availability_overrides WHERE id = $1 AND contractor_id = $2').run(overrideId, contractorId);
  res.json({ message: 'Override removed' });
});

// ── Get open booking slots ────────────────────────────────────────────────────
router.get('/:contractorId/open-slots', async (req, res) => {
  const { contractorId } = req.params;
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required (YYYY-MM-DD)' });

  const weeklySlots = await db.prepare(
    'SELECT * FROM availability_slots WHERE contractor_id = $1 AND is_active = 1'
  ).all(contractorId);

  const overrides = await db.prepare(
    'SELECT * FROM availability_overrides WHERE contractor_id = $1 AND date BETWEEN $2 AND $3'
  ).all(contractorId, from, to);

  const bookedTimes = await db.prepare(`
    SELECT scheduled_date, scheduled_time, duration_minutes
    FROM appointments
    WHERE contractor_id = $1 AND scheduled_date BETWEEN $2 AND $3
    AND status NOT IN ('cancelled')
  `).all(contractorId, from, to);

  const result = [];
  const now = new Date();
  // Use YYYY-MM-DD in local time (avoids UTC shift on Railway which runs UTC)
  const todayStr = now.toISOString().split('T')[0];
  // Current time in minutes, plus a 30-minute buffer so homeowners can't book a slot starting very soon
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + 30;

  for (let cursor = new Date(from + 'T00:00:00Z'); ; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dateStr = cursor.toISOString().split('T')[0];
    if (dateStr > to) break;

    const dayOfWeek = cursor.getUTCDay();

    const override = overrides.find(o => o.date === dateStr);
    if (override && !override.is_available) continue;

    let daySlots;
    if (override && override.is_available && override.start_time) {
      daySlots = [{ start_time: override.start_time, end_time: override.end_time }];
    } else {
      daySlots = weeklySlots.filter(s => s.day_of_week === dayOfWeek);
    }
    if (!daySlots.length) continue;

    const dayBooked = bookedTimes
      .filter(b => b.scheduled_date === dateStr)
      .map(b => b.scheduled_time);

    const isToday = dateStr === todayStr;

    for (const slot of daySlots) {
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      let cur = sh * 60 + sm;
      const endMin = eh * 60 + em;
      while (cur + 60 <= endMin) {
        // Skip slots that have already passed today (with 30-min buffer)
        if (isToday && cur <= nowMinutes) { cur += 60; continue; }
        const timeStr = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
        if (!dayBooked.includes(timeStr)) result.push({ date: dateStr, time: timeStr });
        cur += 60;
      }
    }
  }
  res.json(result);
});

// ── Block external time (outside appointment) ─────────────────────────────────
// Inserts one appointment row per hour with status='external' so the unique
// index prevents ProBook homeowners from booking those slots.
router.post('/:contractorId/manual-block', requireContractor, async (req, res) => {
  const { contractorId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { date, start_time, duration_hours } = req.body;
  if (!date || !start_time || !duration_hours) {
    return res.status(400).json({ error: 'date, start_time, and duration_hours are required' });
  }

  const [startH, startM] = start_time.split(':').map(Number);
  const slots = [];
  for (let i = 0; i < Number(duration_hours); i++) {
    const h = startH + i;
    if (h > 23) break;
    slots.push(`${String(h).padStart(2, '0')}:${String(startM).padStart(2, '0')}`);
  }

  const inserted = [];
  const conflicts = [];

  for (const slotTime of slots) {
    try {
      const id = uuidv4();
      await db.prepare(`
        INSERT INTO appointments (id, contractor_id, lead_id, scheduled_date, scheduled_time, duration_minutes, status)
        VALUES ($1, $2, NULL, $3, $4, 60, 'external')
      `).run(id, contractorId, date, slotTime);
      inserted.push(slotTime);
    } catch (e) {
      if (e.code === '23505' || (e.message && e.message.includes('UNIQUE'))) {
        conflicts.push(slotTime);
      } else {
        throw e;
      }
    }
  }

  if (conflicts.length > 0 && inserted.length === 0) {
    return res.status(409).json({ error: 'All requested slots are already taken', conflicts });
  }

  res.status(201).json({ message: 'Time blocked', inserted, conflicts });
});

// ── Remove a single external block hour ───────────────────────────────────────
router.delete('/:contractorId/manual-block', requireContractor, async (req, res) => {
  const { contractorId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { date, time } = req.query;
  if (!date || !time) return res.status(400).json({ error: 'date and time query params required' });

  await db.prepare(`
    DELETE FROM appointments
    WHERE contractor_id = $1 AND scheduled_date = $2 AND scheduled_time = $3 AND status = 'external'
  `).run(contractorId, date, time);

  res.json({ message: 'Block removed' });
});

module.exports = router;
