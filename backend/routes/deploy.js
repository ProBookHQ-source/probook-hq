'use strict';

/**
 * POST /api/deploy
 *
 * Called by the Cloudflare Worker after a contractor submits the intake form.
 *
 * ⚠️ Rewritten August 13, 2026 for THE PIVOT (see CLAUDE.md) — no more per-contractor
 * website, no portal login, the whole relationship runs over SMS.
 *
 * ⚠️ Simplified again August 14, 2026 (session 26): all account-creation logic moved
 * to services/contractorSignup.js so the exact same logic can be reused by the
 * waitlist "Promote to contractor" admin action (routes/waitlist.js) once Twilio
 * compliance clears for contractors who signed up during the wait. This file is now
 * just the HTTP wrapper — auth, validation, calling the shared service, responding.
 *
 * Auth: Authorization: Bearer {DEPLOY_SECRET}
 */

const express = require('express');
const { createContractorAccount } = require('../services/contractorSignup');

const router = express.Router();

// ── Auth middleware — shared secret set in Railway env ────────────────────────
function requireDeploySecret(req, res, next) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) {
    console.error('[DEPLOY] DEPLOY_SECRET env var not set — rejecting request');
    return res.status(503).json({ error: 'Deploy service not configured' });
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) {
    console.warn('[DEPLOY] Invalid deploy secret from IP:', req.ip);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.post('/', requireDeploySecret, async (req, res) => {
  const data = req.body;

  if (!data.businessName || !data.phone || (!data.nicheId && !data.nicheOther)) {
    return res.status(400).json({ error: 'businessName, phone, and a niche (nicheId or nicheOther) are required' });
  }

  try {
    const result = await createContractorAccount({ ...data, source: 'intake' });
    res.status(201).json({ ok: true, contractorId: result.contractorId, slug: result.slug });
  } catch (err) {
    if (err.code === 'DUPLICATE_PHONE') {
      return res.status(409).json({ error: err.message, contractorId: err.contractorId });
    }
    console.error('[DEPLOY] Signup failed:', err.message);
    res.status(500).json({ error: 'Signup failed', detail: err.message });
  }
});

module.exports = router;
