'use strict';

/**
 * POST /api/deploy
 *
 * Called by the Cloudflare Worker after a contractor submits the intake form.
 *
 * ⚠️ Rewritten August 13, 2026 for THE PIVOT (see CLAUDE.md). The old version of
 * this file deployed a per-contractor HVAC website to Cloudflare Pages and required
 * an email for portal login. Both of those are dead: there is no more per-contractor
 * website, and contractors never log in — the entire relationship runs over SMS.
 *
 * What this does now: create the contractor account (no email required, no login
 * intended), auto-match/create their niche from free text, pre-populate availability
 * from their submitted hours, and alert Jose so he can assign a Twilio number — which
 * is what actually kicks off the SMS welcome conversation (see contractors.js PUT /:id).
 *
 * Auth: Authorization: Bearer {DEPLOY_SECRET}
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');

const db     = require('../database/db');
const { sendDeployAlertToAdmin } = require('../services/notifications');

const router = express.Router();

// ── Auth middleware — shared secret set in Railway env ────────────────────────
function requireDeploySecret(req, res, next) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) {
    // If secret isn't configured, reject all deploys (fail safe)
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

// ── Slug generator — "Premier Comfort HVAC" → "premiercomforthvac" ────────────
// No website hangs off this anymore, but booking_slug is still used elsewhere
// (e.g. the personal /schedule/:slug booking page), so keep generating one.
function generateSlug(businessName) {
  return (businessName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 50) || `contractor${Date.now()}`;
}

// ── Convert "7:00 AM" / "7:00 PM" to "07:00:00" for DB ───────────────────────
function parseTime12h(timeStr) {
  if (!timeStr || timeStr.toLowerCase() === 'closed') return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${min}:00`;
}

// ── Ensure slug is unique (add numeric suffix if taken) ───────────────────────
async function uniqueSlug(baseSlug) {
  let slug = baseSlug;
  let n = 2;
  while (true) {
    const row = await db.prepare('SELECT id FROM contractors WHERE booking_slug = $1').get(slug);
    if (!row) return slug;
    slug = `${baseSlug}${n++}`;
    if (n > 99) throw new Error('Could not generate unique slug after 99 attempts');
  }
}

// ── Niche resolution — canonical list only, never auto-created from free text ─
// ⚠️ Rewritten August 14, 2026. The previous version matched/created niches from
// whatever free text the contractor typed. That silently broke three things at
// once for anything that didn't exact-match a seeded niche name: no RAG diagnostic
// knowledge (Brain 3 has nothing to retrieve), no locked pricing bucket, and
// duplicate/fragmented niche rows ("HVAC" vs "hvac repair" vs "heating and air").
//
// The intake form now sends either:
//   - data.nicheId   — the contractor picked a real niche off the curated list
//                       (Places-category auto-suggest or typeahead search)
//   - data.nicheOther — the "something else" fallback, raw free text, used only
//                        when nothing on the list matched
// Exactly one of these should be present. nicheOther never creates a niche —
// it queues the contractor on a placeholder niche and always requires Jose to
// resolve it by hand (map to an existing niche or approve a genuinely new one).
// This is the deliberate tradeoff: slower per new niche, but nothing — including
// an excluded category like a med spa or a bookkeeper — can ever slip through
// automatically.

// Lightweight heuristic only — flags the admin alert email with a warning, does
// NOT block anything. Jose is the actual gate on every pending-review niche
// regardless of this match. Mirrors the excluded-category list in CLAUDE.md
// ("Niches excluded from the initial rollout" — health, legal, financial-adjacent).
const EXCLUDED_KEYWORD_HINTS = [
  'dental', 'dentist', 'orthodont', 'medical', 'doctor', 'physician', 'clinic', 'health',
  'therapy', 'therapist', 'counsel', 'psych', 'chiropract', 'med spa', 'medspa', 'urgent care',
  'legal', 'lawyer', 'attorney', 'law firm', 'notary',
  'financial', 'accountant', 'cpa', 'tax prep', 'insurance', 'bank', 'lending', 'loan',
  'mortgage broker', 'investment', 'wealth',
];
function looksLikeExcludedCategory(text) {
  const t = (text || '').toLowerCase();
  return EXCLUDED_KEYWORD_HINTS.some(k => t.includes(k));
}

async function getActiveNicheById(nicheId) {
  if (!nicheId) return null;
  return db.prepare(`SELECT id FROM niches WHERE id = $1 AND status = 'active'`).get(nicheId);
}

async function getPendingReviewNicheId() {
  const row = await db.prepare(`SELECT id FROM niches WHERE name = 'Pending Review'`).get();
  if (!row) throw new Error('Pending Review placeholder niche is missing — check server.js migrations ran');
  return row.id;
}

// ── Pre-populate availability slots from intake hours ─────────────────────────
async function seedAvailability(contractorId, hoursRaw) {
  const hrs = hoursRaw || {};
  const slots = [];

  // Mon–Fri (days 1–5)
  const wdStart = parseTime12h(hrs.wdOpen);
  const wdEnd   = parseTime12h(hrs.wdClose);
  if (wdStart && wdEnd) {
    for (let day = 1; day <= 5; day++) {
      slots.push({ day, start: wdStart, end: wdEnd });
    }
  }

  // Saturday (day 6)
  const satStart = parseTime12h(hrs.satOpen);
  const satEnd   = parseTime12h(hrs.satClose);
  if (satStart && satEnd) {
    slots.push({ day: 6, start: satStart, end: satEnd });
  }

  // Sunday (day 0)
  const sunStart = parseTime12h(hrs.sunOpen);
  const sunEnd   = parseTime12h(hrs.sunClose);
  if (sunStart && sunEnd) {
    slots.push({ day: 0, start: sunStart, end: sunEnd });
  }

  for (const s of slots) {
    await db.query(
      'INSERT INTO availability_slots (id, contractor_id, day_of_week, start_time, end_time, is_active) VALUES ($1, $2, $3, $4, $5, 1)',
      [uuidv4(), contractorId, s.day, s.start, s.end]
    );
  }
  console.log(`[DEPLOY] Seeded ${slots.length} availability slot(s) for contractor ${contractorId}`);
}

// ── Main deploy handler ────────────────────────────────────────────────────────
router.post('/', requireDeploySecret, async (req, res) => {
  const data = req.body;

  // Validate required fields — email is intentionally NOT required. The new
  // intake form never collects one; contractors don't log in. Exactly one of
  // nicheId / nicheOther must be present — this is required server-side too
  // (not just client-side) because niche_id is NOT NULL on the contractors
  // table; without this check, a missing niche would crash the INSERT below
  // with an unhandled constraint violation instead of a clean 400.
  if (!data.businessName || !data.phone || (!data.nicheId && !data.nicheOther)) {
    return res.status(400).json({ error: 'businessName, phone, and a niche (nicheId or nicheOther) are required' });
  }

  const phoneDigits = (data.phone || '').replace(/\D/g, '');
  const log = (msg) => console.log(`[DEPLOY] [${data.businessName}] ${msg}`);

  log(`Starting signup for ${data.phone}`);

  // Check for duplicate signup by phone (the real identity key now, not email)
  const existing = await db.prepare('SELECT id FROM contractors WHERE phone = $1').get(data.phone);
  if (existing) {
    log(`Contractor already exists with phone ${data.phone} — skipping`);
    return res.status(409).json({ error: 'Contractor already exists with this phone number', contractorId: existing.id });
  }

  // ── Step 1: Generate slug & ensure uniqueness ──────────────────────────────
  const baseSlug = generateSlug(data.businessName);
  const slug     = await uniqueSlug(baseSlug);
  log(`Slug: ${slug}`);

  // ── Step 2: Create contractor account ─────────────────────────────────────
  // No real email exists — generate a synthetic, unique, never-shown placeholder
  // purely to satisfy the DB's NOT NULL/UNIQUE constraint. Never emailed, never
  // used for login. Password is a random value that's likewise never surfaced —
  // the whole point is contractors never need to log in.
  const syntheticEmail = `${phoneDigits}@sms.tractifyhq.com`;
  const tempPassword   = crypto.randomBytes(10).toString('hex');
  const contractorId   = uuidv4();
  const passwordHash   = bcrypt.hashSync(tempPassword, 10);

  // ── Resolve niche — canonical id preferred, free-text always queues for review ──
  let nicheId;
  let requestedNicheText = null;
  let nichePendingReview = false;

  if (data.nicheId) {
    const active = await getActiveNicheById(data.nicheId);
    if (active) {
      nicheId = active.id;
      log(`Niche resolved: canonical id ${nicheId}`);
    } else {
      // A stale/tampered/deactivated id was sent — fall back to pending review
      // rather than rejecting the whole signup.
      log(`Niche id ${data.nicheId} is not a valid active niche — queuing for review`);
      nicheId = await getPendingReviewNicheId();
      requestedNicheText = data.nicheOther || `(invalid niche id: ${data.nicheId})`;
      nichePendingReview = true;
    }
  } else {
    nicheId = await getPendingReviewNicheId();
    requestedNicheText = data.nicheOther.trim();
    nichePendingReview = true;
    log(`No canonical niche match — queued for review: "${requestedNicheText}"`);
  }

  // Service zips aren't collected on the new form — service area is meant to be
  // derived from the geocoded address later. '*' is the existing "serves anywhere"
  // fallback already used elsewhere in this codebase.
  const zips = JSON.stringify(['*']);

  await db.query(`
    INSERT INTO contractors
      (id, email, password_hash, name, phone, company_name, niche_id,
       service_zip_codes, is_active, status, booking_slug, onboarding_started_at,
       acquisition_source, address, place_id, requested_niche_text)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,'approved',$9,NOW(),$10,$11,$12,$13)
  `, [
    contractorId,
    syntheticEmail,
    passwordHash,
    data.businessName,
    data.phone,
    data.businessName,
    nicheId,
    zips,
    slug,
    data.acquisitionSource || null,
    data.address || null,
    data.placeId || null,
    requestedNicheText,
  ]);

  log(`Contractor created: ${contractorId}`);

  // ── Step 3: Create API key linked to contractor ────────────────────────────
  // Still relevant post-pivot even with no per-contractor website: any external
  // lead source (Facebook Lead Ads, Google Call-Only landing pages, future
  // channels) can hit POST /api/leads/inbound with this key and route straight
  // to this contractor, bypassing the matching engine. No site to restrict
  // origins to anymore, so allowed_origins is left unrestricted.
  const apiKey   = 'pb_' + crypto.randomBytes(24).toString('hex');
  const apiKeyId = uuidv4();
  await db.query(`
    INSERT INTO inbound_api_keys (id, name, key, source_slug, is_active, contractor_id)
    VALUES ($1,$2,$3,$4,1,$5)
  `, [apiKeyId, data.businessName, apiKey, slug, contractorId]);
  log(`API key created: ${apiKeyId}`);

  // ── Step 4: Pre-populate availability from submitted hours ────────────────
  try {
    await seedAvailability(contractorId, data.hoursRaw);
  } catch (availErr) {
    log(`Availability seed warning: ${availErr.message}`);
    // Non-fatal — hours can be confirmed/corrected over text later
  }

  // ── Step 5: Alert admin — assigning a Twilio number is the next manual step,
  // which automatically fires the SMS welcome conversation (contractors.js PUT /:id) ──
  try {
    const nicheRow = await db.prepare('SELECT name FROM niches WHERE id = $1').get(nicheId);
    await sendDeployAlertToAdmin({
      businessName: data.businessName,
      phone:        data.phone,
      address:      data.address || '',
      niche:        nicheRow?.name || '',
      contractorId,
      slug,
      nichePendingReview,
      requestedNicheText,
      excludedCategoryWarning: nichePendingReview ? looksLikeExcludedCategory(requestedNicheText) : false,
    });
  } catch (e) {
    log(`Admin alert failed: ${e.message}`);
  }

  log(`Signup complete ✓`);

  res.status(201).json({
    ok: true,
    contractorId,
    slug,
  });
});

module.exports = router;
