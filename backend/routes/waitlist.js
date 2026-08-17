'use strict';

/**
 * Waitlist — built August 14, 2026 (session 26).
 *
 * Jose and Daniel's idea: don't let Twilio compliance being stuck block content and
 * ad spend. Instead of the intake form's "we'll text you in minutes" promise (which
 * is currently false — no real number is being assigned), a business can join a
 * simple waitlist (name + phone only). The moment compliance clears, Jose promotes
 * each row to a real contractor account via the exact same signup logic the intake
 * form uses (services/contractorSignup.js) — no duplicate account-creation code.
 *
 * Routes:
 *   POST /api/waitlist              — public, capture a signup
 *   GET  /api/waitlist              — admin, list all signups
 *   POST /api/waitlist/:id/promote  — admin, turn a signup into a real contractor
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { createContractorAccount } = require('../services/contractorSignup');
const { sendWaitlistSignupAlert } = require('../services/notifications');

const router = express.Router();

// ── POST /api/waitlist — public signup ─────────────────────────────────────────
router.post('/', async (req, res) => {
  const { businessName, phone, acquisitionSource } = req.body || {};

  if (!businessName || !businessName.trim()) {
    return res.status(400).json({ error: 'Business name is required' });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Same normalize-and-dedupe intent as contractorSignup.js's phone check — a
  // person hitting submit twice, or a business already on the list, shouldn't
  // create a duplicate row. Unique index on phone backs this up at the DB level.
  const existing = await db.prepare('SELECT id, status FROM waitlist_signups WHERE phone = $1').get(phone.trim());
  if (existing) {
    return res.status(200).json({ ok: true, alreadyOnWaitlist: true, status: existing.status });
  }

  const id = uuidv4();
  await db.query(`
    INSERT INTO waitlist_signups (id, business_name, phone, acquisition_source, status)
    VALUES ($1, $2, $3, $4, 'waiting')
  `, [id, businessName.trim(), phone.trim(), acquisitionSource || null]);

  console.log(`[WAITLIST] New signup: ${businessName.trim()} (${phone.trim()})`);
  res.status(201).json({ ok: true, id });

  // Fire-and-forget — never block or fail the signup response on an email hiccup.
  sendWaitlistSignupAlert({
    businessName: businessName.trim(),
    phone: phone.trim(),
    acquisitionSource: acquisitionSource || null,
  }).catch(err => console.error('[WAITLIST] Alert email failed:', err.message));
});

// ── GET /api/waitlist — admin list ─────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  const { rows } = await db.query(`
    SELECT id, business_name, phone, acquisition_source, status,
           promoted_contractor_id, promoted_at, created_at
    FROM waitlist_signups
    ORDER BY created_at DESC
  `);
  res.json(rows);
});

// ── POST /api/waitlist/:id/promote — admin, create the real contractor account ──
router.post('/:id/promote', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nicheId, nicheOther, address, placeId, hoursRaw } = req.body || {};

  if (!nicheId && !nicheOther) {
    return res.status(400).json({ error: 'A niche (nicheId or nicheOther) is required to promote a waitlist signup' });
  }

  const row = await db.prepare('SELECT * FROM waitlist_signups WHERE id = $1').get(id);
  if (!row) return res.status(404).json({ error: 'Waitlist signup not found' });
  if (row.status === 'promoted') {
    return res.status(409).json({ error: 'Already promoted', contractorId: row.promoted_contractor_id });
  }

  try {
    const result = await createContractorAccount({
      businessName: row.business_name,
      phone: row.phone,
      address: address || null,
      placeId: placeId || null,
      nicheId: nicheId || null,
      nicheOther: nicheOther || null,
      acquisitionSource: row.acquisition_source,
      hoursRaw: hoursRaw || null,
      source: 'waitlist',
    });

    await db.query(`
      UPDATE waitlist_signups
      SET status = 'promoted', promoted_contractor_id = $1, promoted_at = NOW()
      WHERE id = $2
    `, [result.contractorId, id]);

    res.json({ ok: true, contractorId: result.contractorId, slug: result.slug, nichePendingReview: result.nichePendingReview });
  } catch (err) {
    if (err.code === 'DUPLICATE_PHONE') {
      // A contractor with this phone already exists (e.g. promoted once already
      // through a different path) — mark this row promoted and point at it rather
      // than erroring forever.
      await db.query(`
        UPDATE waitlist_signups
        SET status = 'promoted', promoted_contractor_id = $1, promoted_at = NOW()
        WHERE id = $2
      `, [err.contractorId, id]);
      return res.status(200).json({ ok: true, contractorId: err.contractorId, alreadyExisted: true });
    }
    console.error('[WAITLIST] Promote failed:', err.message);
    res.status(500).json({ error: 'Promote failed', detail: err.message });
  }
});

module.exports = router;
