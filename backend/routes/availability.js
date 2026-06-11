const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireContractor } = require('../middleware/auth');

const router = express.Router();

// ── Get contractor's weekly availability ─────────────────────────────────────
router.get('/:contractorId/slots', (req, res) => {
  const { contractorId } = req.params;
  const slots = db.prepare(
    'SELECT * FROM availability_slots WHERE contractor_id = ? AND is_active = 1 ORDER BY day_of_week, start_time'
  ).all(contractorId);
  res.json(slots);
});

// ── Set/replace weekly availability ─────────────────────────────────────────
// Body: [{ day_of_week: 1, start_time: "09:00", end_time: "17:00" }, ...]
router.put('/:contractorId/slots', requireContractor, (req, res) => {
  const { contractorId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const slots = req.body;
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'Body must be an array of slots' });

  db.run('BEGIN');
  try {
    db.prepare('DELETE FROM availability_slots WHERE contractor_id = ?').run(contractorId);
    const insert = db.prepare(
      'INSERT INTO availability_slots (id, contractor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
    );
    for (const slot of slots) {
      if (slot.day_of_week === undefined || !slot.start_time || !slot.end_time) continue;
      insert.run(uuidv4(), contractorId, slot.day_of_week, slot.start_time, slot.end_time);
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
  res.json({ message: 'Availability updated' });
});

// ── Get overrides (date-specific blocks or opens) ────────────────────────────
router.get('/:contractorId/overrides', (req, res) => {
  const { contractorId } = req.params;
  const { from, to } = req.query;
  let query = 'SELECT * FROM availability_overrides WHERE contractor_id = ?';
  const params = [contractorId];
  if (from) { query += ' AND date >= ?'; params.push(from); }
  if (to)   { query += ' AND date <= ?'; params.push(to); }
  query += ' ORDER BY date';
  const overrides = db.prepare(query).all(...params);
  res.json(overrides);
});

// ── Add or update an override ────────────────────────────────────────────────
router.post('/:contractorId/overrides', requireContractor, (req, res) => {
  const { contractorId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { date, is_available, start_time, end_time, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });

  // Upsert by contractor+date
  const existing = db.prepare(
    'SELECT id FROM availability_overrides WHERE contractor_id = ? AND date = ?'
  ).get(contractorId, date);

  if (existing) {
    db.prepare(`
      UPDATE availability_overrides
      SET is_available = ?, start_time = ?, end_time = ?, reason = ?
      WHERE id = ?
    `).run(is_available ? 1 : 0, start_time || null, end_time || null, reason || null, existing.id);
    res.json({ id: existing.id, message: 'Override updated' });
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO availability_overrides (id, contractor_id, date, is_available, start_time, end_time, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, contractorId, date, is_available ? 1 : 0, start_time || null, end_time || null, reason || null);
    res.status(201).json({ id, message: 'Override created' });
  }
});

// ── Delete an override ───────────────────────────────────────────────────────
router.delete('/:contractorId/overrides/:overrideId', requireContractor, (req, res) => {
  const { contractorId, overrideId } = req.params;
  if (req.user.role !== 'admin' && req.user.id !== contractorId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  db.prepare('DELETE FROM availability_overrides WHERE id = ? AND contractor_id = ?').run(overrideId, contractorId);
  res.json({ message: 'Override removed' });
});

// ── Get open booking slots for a contractor over a date range ────────────────
// Used by homeowner booking flow to see what's available
router.get('/:contractorId/open-slots', (req, res) => {
  const { contractorId } = req.params;
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to dates required (YYYY-MM-DD)' });

  const weeklySlots = db.prepare(
    'SELECT * FROM availability_slots WHERE contractor_id = ? AND is_active = 1'
  ).all(contractorId);

  const overrides = db.prepare(
    'SELECT * FROM availability_overrides WHERE contractor_id = ? AND date BETWEEN ? AND ?'
  ).all(contractorId, from, to);

  const bookedTimes = db.prepare(`
    SELECT scheduled_date, scheduled_time, duration_minutes
    FROM appointments
    WHERE contractor_id = ? AND scheduled_date BETWEEN ? AND ?
    AND status NOT IN ('cancelled')
  `).all(contractorId, from, to);

  // Build available slots day by day
  const result = [];
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay();

    // Check for override on this date
    const override = overrides.find(o => o.date === dateStr);
    if (override && !override.is_available) continue; // blocked out

    // Get schedule for this day
    let daySlots;
    if (override && override.is_available && override.start_time) {
      daySlots = [{ start_time: override.start_time, end_time: override.end_time }];
    } else {
      daySlots = weeklySlots.filter(s => s.day_of_week === dayOfWeek);
    }
    if (!daySlots.length) continue;

    // Generate hourly openings within each slot
    const dayBooked = bookedTimes.filter(b => b.scheduled_date === dateStr).map(b => b.scheduled_time);

    for (const slot of daySlots) {
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      let cur = sh * 60 + sm;
      const endMin = eh * 60 + em;

      while (cur + 60 <= endMin) {
        const timeStr = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
        if (!dayBooked.includes(timeStr)) {
          result.push({ date: dateStr, time: timeStr });
        }
        cur += 60;
      }
    }
  }

  res.json(result);
});

module.exports = router;
