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

// ── Find or create a niche from the contractor's free-text "what do you do" ───
// The intake form no longer offers a dropdown — it's one line of free text.
// Match case-insensitively against existing niches; if nothing matches, create
// a new niche row from the raw text. This is the "database insert, not a code
// change" niche-expansion model described in CLAUDE.md — no AI normalization
// yet (that's a documented future enhancement), just a straightforward match.
async function findOrCreateNiche(rawText) {
  const cleaned = (rawText || '').trim();
  if (!cleaned) return null;

  const existing = await db.prepare(
    'SELECT id FROM niches WHERE LOWER(name) = LOWER($1) LIMIT 1'
  ).get(cleaned);
  if (existing) return existing.id;

  const id = uuidv4();
  await db.query(
    'INSERT INTO niches (id, name, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
    [id, cleaned, `Auto-created from intake signup: "${cleaned}"`]
  );
  const row = await db.prepare('SELECT id FROM niches WHERE LOWER(name) = LOWER($1) LIMIT 1').get(cleaned);
  return row ? row.id : id;
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
  // intake form never collects one; contractors don't log in.
  if (!data.businessName || !data.phone) {
    return res.status(400).json({ error: 'businessName and phone are required' });
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

  const nicheId = await findOrCreateNiche(data.niche);
  log(`Niche resolved: ${data.niche || '(none)'} → ${nicheId || 'none'}`);

  // Service zips aren't collected on the new form — service area is meant to be
  // derived from the geocoded address later. '*' is the existing "serves anywhere"
  // fallback already used elsewhere in this codebase.
  const zips = JSON.stringify(['*']);

  await db.query(`
    INSERT INTO contractors
      (id, email, password_hash, name, phone, company_name, niche_id,
       service_zip_codes, is_active, status, booking_slug, onboarding_started_at,
       acquisition_source, address, place_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,'approved',$9,NOW(),$10,$11,$12)
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
  ]);

  log(`Contractor created: ${contractorId}`);

  // ── Step 3: Pre-populate availability from submitted hours ────────────────
  try {
    await seedAvailability(contractorId, data.hoursRaw);
  } catch (availErr) {
    log(`Availability seed warning: ${availErr.message}`);
    // Non-fatal — hours can be confirmed/corrected over text later
  }

  // ── Step 4: Alert admin — assigning a Twilio number is the next manual step,
  // which automatically fires the SMS welcome conversation (contractors.js PUT /:id) ──
  try {
    await sendDeployAlertToAdmin({
      businessName: data.businessName,
      phone:        data.phone,
      address:      data.address || '',
      niche:        data.niche || '',
      contractorId,
      slug,
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
