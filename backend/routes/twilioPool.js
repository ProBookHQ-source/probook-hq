// ── Admin routes for the shared Twilio number pool ─────────────────────────────
// Session 27 (August 17, 2026). See backend/services/twilioPool.js for the
// actual assign/release logic — this file is just the admin-facing CRUD layer
// around it: registering numbers Jose has bought, viewing pool status, and
// manually disabling/releasing a number if something goes wrong.
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const db = require('../database/db');
const { addNumberToPool, getPoolStats, releasePoolNumber } = require('../services/twilioPool');

// GET / — pool status: counts by status + full row list (with assigned contractor name)
router.get('/', requireAdmin, async (req, res) => {
  const stats = await getPoolStats();
  res.json(stats);
});

// POST / — register a number Jose already bought in the Twilio console.
// Body: { phoneNumber: "+12065551234" }
router.post('/', requireAdmin, async (req, res) => {
  const { phoneNumber } = req.body || {};
  if (!phoneNumber || !/^\+?[1-9]\d{7,14}$/.test(phoneNumber.replace(/[\s\-().]/g, ''))) {
    return res.status(400).json({ error: 'phoneNumber is required and must look like a real phone number (E.164 preferred, e.g. +12065551234)' });
  }
  const normalized = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber.replace(/\D/g, '')}`;
  const id = await addNumberToPool(normalized);
  res.json({ ok: true, id, phoneNumber: normalized });
});

// POST /:id/disable — pull a bad/broken number out of rotation permanently
router.post('/:id/disable', requireAdmin, async (req, res) => {
  const row = await db.prepare('SELECT * FROM twilio_number_pool WHERE id = $1').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Pool number not found' });
  if (row.status === 'assigned' && row.assigned_contractor_id) {
    // Release from the contractor first so their account isn't left pointing at
    // a number that's about to be marked disabled.
    await releasePoolNumber(row.assigned_contractor_id, 'disabled_by_admin');
  }
  await db.query(`UPDATE twilio_number_pool SET status = 'disabled' WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// POST /:id/release — manual release back to 'available' (e.g. Jose knows a
// trial contractor isn't coming back and wants the number free immediately
// instead of waiting on the auto-release cron).
router.post('/:id/release', requireAdmin, async (req, res) => {
  const row = await db.prepare('SELECT * FROM twilio_number_pool WHERE id = $1').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Pool number not found' });
  if (!row.assigned_contractor_id) return res.status(409).json({ error: 'This number is not currently assigned to anyone' });
  await releasePoolNumber(row.assigned_contractor_id, 'manual_admin_release');
  res.json({ ok: true });
});

module.exports = router;
