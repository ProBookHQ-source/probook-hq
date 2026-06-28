const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── Track a step event (public — called from client intake form) ──────────────
router.post('/track', async (req, res) => {
  const { type, step, stepName, direction, clientId, businessName, timestamp } = req.body;

  if (step === undefined || !stepName || !direction || !clientId) {
    return res.status(400).json({ error: 'step, stepName, direction, and clientId are required' });
  }
  if (!['start', 'forward', 'back'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be start, forward, or back' });
  }

  const ts = timestamp ? new Date(timestamp) : new Date();
  if (isNaN(ts.getTime())) {
    return res.status(400).json({ error: 'Invalid timestamp' });
  }

  await db.prepare(`
    INSERT INTO intake_events (id, type, step, step_name, direction, client_id, business_name, ts)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `).run(
    uuidv4(),
    type || 'intake_step',
    Number(step),
    stepName,
    direction,
    clientId,
    businessName || null,
    ts
  );

  res.status(201).json({ ok: true });
});

// ── Funnel stats (admin only) ─────────────────────────────────────────────────
// Returns: total starts, unique sessions per step, and dropoff rates
router.get('/stats', requireAdmin, async (req, res) => {
  // Total unique sessions that opened the form (step 0, direction = start)
  const { rows: startRows } = await db.query(`
    SELECT COUNT(DISTINCT client_id) as total_starts
    FROM intake_events
    WHERE step = 0 AND direction = 'start'
  `);
  const totalStarts = parseInt(startRows[0]?.total_starts || 0);

  // Per-step: unique sessions that reached each step going forward
  const { rows: stepRows } = await db.query(`
    SELECT step, step_name,
           COUNT(DISTINCT client_id) as sessions,
           COUNT(*) as total_events
    FROM intake_events
    WHERE direction IN ('start', 'forward')
    GROUP BY step, step_name
    ORDER BY step ASC
  `);

  // Completions = sessions that reached the highest step going forward
  const { rows: completionRows } = await db.query(`
    SELECT COUNT(DISTINCT client_id) as completions
    FROM intake_events
    WHERE direction = 'forward'
    AND step = (SELECT MAX(step) FROM intake_events WHERE direction = 'forward')
  `);
  const completions = parseInt(completionRows[0]?.completions || 0);

  // Recent sessions (last 20) for the activity feed
  const { rows: recentRows } = await db.query(`
    SELECT client_id, business_name,
           MAX(step) as last_step,
           MAX(step_name) as last_step_name,
           MIN(ts) as started_at,
           MAX(ts) as last_seen_at
    FROM intake_events
    GROUP BY client_id, business_name
    ORDER BY MAX(ts) DESC
    LIMIT 20
  `);

  // Build steps with dropoff rate relative to total starts
  const steps = stepRows.map(s => ({
    step: s.step,
    stepName: s.step_name,
    sessions: parseInt(s.sessions),
    dropoffPct: totalStarts > 0
      ? Math.round((1 - parseInt(s.sessions) / totalStarts) * 100)
      : 0,
  }));

  res.json({
    totalStarts,
    completions,
    completionRate: totalStarts > 0 ? Math.round((completions / totalStarts) * 100) : 0,
    steps,
    recentSessions: recentRows,
  });
});

module.exports = router;
