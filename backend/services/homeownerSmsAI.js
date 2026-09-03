/**
 * homeownerSmsAI.js — Brain 3: Homeowner conversational SMS booking
 *
 * When a homeowner texts a contractor's Twilio number (via missed call, van wrap,
 * Facebook Lead Ad, or any other channel), this brain takes over and books them
 * in a 4-message conversation — entirely over SMS, no browser required.
 *
 * State machine:
 *   awaiting_address  → awaiting_service → awaiting_slot → awaiting_email → confirmed
 *   (returning homeowners skip awaiting_address — pre-populated from last booking)
 *
 * The contractor finds out when a push notification hits their phone.
 * The homeowner gets a confirmation text. Nobody did anything manually.
 */

const { v4: uuidv4 } = require('uuid');
const https  = require('https');
const zipcodes = require('zipcodes');
const db     = require('../database/db');
const { getRelevantKnowledge } = require('./diagnosticKnowledge');
const { extractZip, isValidZip } = require('./addressUtils');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_CHARS = 320;

// ── Niche-aware opening question ────────────────────────────────────────────
// This was hardcoded as "AC, heating, or something else?" for every niche —
// found live on a real roofing contractor's test where a homeowner describing
// falling drywall got asked an HVAC-specific question. Keyed the same way
// diagnosticKnowledge.js's own niche normalization works (lowercase, spaces →
// underscores), but kept as its own small local map here rather than importing
// diagnosticKnowledge's internal normalizeNiche (not exported, and this only
// needs simple string matching, not the DB-backed RAG lookup).
const NICHE_SERVICE_QUESTIONS = {
  hvac:          `Got it. What's going on — AC, heating, or something else?`,
  roofing:       `Got it. What's going on — a leak, missing or damaged shingles, or something else?`,
  electrical:    `Got it. What's going on — a tripped breaker, an outlet or fixture issue, or something else?`,
  plumbing:      `Got it. What's going on — a leak, a clog, no hot water, or something else?`,
  landscaping:   `Got it. What's going on — a design/install project, or something else?`,
  painting:      `Got it. What's going on — interior, exterior, or something else?`,
  general:       `Got it. What's going on with your project?`,
  solar:         `Got it. What's going on — a new install, an existing system issue, or something else?`,
  water_damage:  `Got it. What's going on — flooding, a leak, or water damage from something else?`,
  tree_service:  `Got it. What's going on — trimming, removal, storm damage, or something else?`,
  lawn_care:     `Got it. What service are you looking for — mowing, fertilization, or something else?`,
  pool_service:  `Got it. What's going on — equipment repair, maintenance, or something else?`,
  pest_control:  `Got it. What are you dealing with — ants, rodents, or something else?`,
};

function getServiceQuestion(nicheName) {
  const key = (nicheName || '').toLowerCase().trim().replace(/\s+/g, '_').replace(/\//g, '_');
  return NICHE_SERVICE_QUESTIONS[key] || `Got it. What's going on — tell me a bit about the issue?`;
}

// ── Scope check — what this contractor's niche actually covers ─────────────
// Used to ground the scope-classification call below so it isn't just vibes —
// gives Claude an explicit, short definition of the trade to compare the
// homeowner's described issue against.
const NICHE_SCOPE_DESCRIPTIONS = {
  hvac:          'HVAC — heating, ventilation, and air conditioning: furnaces, AC units, heat pumps, mini-splits, ductwork, thermostats, indoor air quality',
  roofing:       'roofing — roof leaks, missing or damaged shingles, roof replacement, roof-caused water intrusion, ice dams, storm damage to the roof itself',
  electrical:    'electrical work — wiring, breakers, panels, outlets, light fixtures, electrical safety issues',
  plumbing:      'plumbing — pipes, leaks, clogs, water heaters, fixtures, drains',
  landscaping:   'landscape design and installation — NOT lawn mowing or routine lawn maintenance',
  painting:      'interior and exterior painting',
  general:       'general contracting and home improvement projects',
  solar:         'solar panel installation and existing solar system issues',
  water_damage:  'water damage remediation — flooding, water intrusion, and water-caused damage regardless of the original source',
  tree_service:  'tree trimming, tree removal, and storm-damage tree cleanup',
  lawn_care:     'lawn mowing, fertilization, and routine lawn maintenance — NOT landscape design/install',
  pool_service:  'pool equipment repair and pool maintenance',
  pest_control:  'pest control — insects, rodents, and wildlife issues',
};

function getScopeDescription(nicheName) {
  const key = (nicheName || '').toLowerCase().trim().replace(/\s+/g, '_').replace(/\//g, '_');
  return NICHE_SCOPE_DESCRIPTIONS[key] || (nicheName ? `${nicheName} services` : 'home services');
}

/**
 * classifyServiceScope(nicheName, combinedText)
 *
 * Screens a homeowner's described issue against what this contractor's niche
 * actually covers, BEFORE any appointment slots are offered. Found live: a
 * roofing contractor's test homeowner described a furnace/heating issue, Brain 3
 * generated a clarifying question as plain text, but the code had already
 * committed the session to state='awaiting_slot' with slots pre-loaded — so the
 * clarifying question was cosmetic and the booking went through regardless on
 * the very next reply. This makes the scope decision an explicit, structured
 * gate that the state machine actually respects instead of hoping the model's
 * free-text phrasing gets picked up on.
 *
 * Fails open (returns in_scope) on any API/parse error — a classifier hiccup
 * should never be the reason a real, in-scope job doesn't get booked.
 */
async function classifyServiceScope(nicheName, combinedText) {
  if (!ANTHROPIC_API_KEY) return { scope: 'in_scope' };

  const scopeDesc = getScopeDescription(nicheName);
  const system = `You are screening homeowner service requests for a business that does ONLY the following: ${scopeDesc}.
The homeowner just described their issue. Classify it into exactly one of three categories and return ONLY valid JSON:
{"scope": "in_scope" | "unclear" | "out_of_scope", "message": "..."}

- "in_scope": the issue is clearly something this business handles.
- "unclear": the issue COULD be caused by or related to this business's trade but needs one clarifying question to confirm before booking (example: drywall or ceiling damage could be caused by a roof leak, or could be totally unrelated to roofing). If unclear, "message" must be ONE short, friendly clarifying question (under 200 characters) that ties back to what this business actually does, so the homeowner's next reply can be re-classified.
- "out_of_scope": the issue is clearly a different trade entirely with no plausible connection to what this business does (example: a lawn-mowing request sent to an electrician). If out_of_scope, "message" must be a short, honest, friendly reply (under 200 characters) letting them know this isn't something this business handles. Do not invent a referral or another business name.

Return ONLY the JSON object. No explanation.`;

  try {
    const result = await callClaude([{ role: 'user', content: combinedText }], [], system);
    const raw = result.content?.[0]?.text?.trim();
    const parsed = JSON.parse(raw);
    if (['in_scope', 'unclear', 'out_of_scope'].includes(parsed.scope)) return parsed;
    return { scope: 'in_scope' };
  } catch (e) {
    console.error('[BRAIN3] Scope classification error (failing open — treating as in_scope):', e.message);
    return { scope: 'in_scope' };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDate(dateStr) {
  // dateStr = 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Slot-offer formatting + flexible reply matching (task #85) ──────────────
// Live-caught: presenting 3 options as "1) ... 2) ... 3) ..." run together in
// one paragraph, then requiring a bare "1"/"2"/"3" reply, read as a confusing
// multiple-choice menu rather than a normal text exchange. Two fixes below:
// (1) put each option on its own real line so it's scannable on a phone
// screen, and (2) let a homeowner answer however a real person would — "Tuesday",
// "the 8:30 one", "wednesday works" — not just a digit.

// One option per line, e.g. "1) Wed, Aug 5 at 8:30 AM\n2) Thu, Aug 6 at 10:00 AM"
function formatSlotOptionsBlock(offered) {
  return offered.map((s, i) => `${i + 1}) ${s.label}`).join('\n');
}

const SLOT_REPLY_INSTRUCTION = 'Reply with the number, or just tell me which day or time works.';

// Strips everything but letters/digits and lowercases, so punctuation/spacing
// differences ("8:30am" vs "830 am" vs "the 8:30 one") don't block a match.
function normalizeForMatch(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const WEEKDAY_LONG = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Matches a homeowner's free-text reply ("Tuesday", "the 10am one", "2") against
// the 3 offered slots. Tries, in order: exact bare number, full-label substring
// (either direction), then day-name only, then time-only — so a reply that only
// specifies the day or only the time still resolves as long as it's unambiguous
// relative to how specific the earlier checks already were.
function matchSlotFromText(text, offeredSlots) {
  const pick = (text || '').trim();
  if (!pick) return null;

  if (/^\d+$/.test(pick)) {
    const num = parseInt(pick, 10);
    if (num >= 1 && num <= offeredSlots.length) return offeredSlots[num - 1];
  }

  const lowerPick = pick.toLowerCase();
  let match = offeredSlots.find(s => s.label.toLowerCase().includes(lowerPick));
  if (match) return match;

  const normalizedReply = normalizeForMatch(pick);
  if (!normalizedReply) return null;

  match = offeredSlots.find(s => {
    const normalizedLabel = normalizeForMatch(s.label);
    return normalizedLabel && (normalizedReply.includes(normalizedLabel) || normalizedLabel.includes(normalizedReply));
  });
  if (match) return match;

  match = offeredSlots.find(s => {
    const d = new Date(s.date + 'T12:00:00');
    const shortName = fmtDate(s.date).slice(0, 3).toLowerCase();
    const longName = WEEKDAY_LONG[d.getDay()];
    return normalizedReply.includes(shortName) || normalizedReply.includes(longName);
  });
  if (match) return match;

  match = offeredSlots.find(s => {
    const t = normalizeForMatch(fmtTime(s.time));
    return t && normalizedReply.includes(t);
  });
  return match || null;
}

// Formats a raw phone string (+12065551234, 2065551234, etc) as (206) 555-1234
// for anything shown to a human. Never show a raw E.164 string to a contractor.
function fmtPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '').slice(-10); // last 10 digits (drops leading 1/+1)
  if (digits.length !== 10) return raw; // fallback — don't mangle something we can't parse
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// ── ZIP extraction + service area check ──────────────────────────────────────
// extractZip moved to addressUtils.js (task #88) — now validates against the
// real zipcodes DB instead of trusting any 5-digit substring (e.g. a 5-digit
// house number with no real zip present), and is shared with matchingEngine.js
// so the two never drift apart again.

// contractor = { service_zip_codes, address, service_radius_miles } — pass the full
// row (not just service_zip_codes) so a wildcard ("I'll go anywhere") can still be
// bounded by a real mile radius instead of meaning literally unlimited/any-state.
function isInServiceArea(address, contractor) {
  try {
    const serviceZipCodesJson = contractor && typeof contractor === 'object'
      ? contractor.service_zip_codes
      : contractor; // backwards-compat if ever called with just the JSON value
    const zips = typeof serviceZipCodesJson === 'string'
      ? JSON.parse(serviceZipCodesJson)
      : serviceZipCodesJson;

    if (!zips || !Array.isArray(zips)) return true; // no data — permissive

    if (zips.includes('*')) {
      // Wildcard/"no limit" mode — still enforce a real mile radius from the
      // contractor's own business address instead of treating this as truly
      // unlimited. A contractor who says "I'll go anywhere" almost certainly
      // means "within my region," not "someone in another state can book me."
      const radiusMiles = (contractor && typeof contractor === 'object' && contractor.service_radius_miles)
        ? Number(contractor.service_radius_miles)
        : 25; // sane default if a radius was never captured
      const contractorZip = contractor && typeof contractor === 'object'
        ? extractZip(contractor.address)
        : null;
      const homeownerZip = extractZip(address);
      // These fail open on purpose (never block a legit booking over a parsing
      // hiccup) but that policy is exactly what made the old unbounded-wildcard
      // bug invisible for weeks — logging here means if this branch ever starts
      // firing constantly (e.g. a systematic address-format issue), it shows up
      // in logs instead of silently defeating the service-area gate forever.
      if (!contractorZip || !homeownerZip) {
        console.warn(`[BRAIN3] isInServiceArea: could not resolve zip for radius check (contractor=${contractor?.id || '?'}, contractorZip=${contractorZip}, homeownerZip=${homeownerZip}) — allowing booking`);
        return true;
      }
      const miles = zipcodes.distance(contractorZip, homeownerZip);
      if (miles === null || miles === undefined) {
        console.warn(`[BRAIN3] isInServiceArea: zipcodes.distance() returned null for ${contractorZip}<->${homeownerZip} — allowing booking`);
        return true;
      }
      return miles <= radiusMiles;
    }

    const zip = extractZip(address);
    if (!zip) return true; // can't parse ZIP — give benefit of the doubt (expected, common — no log)
    return zips.includes(zip);
  } catch (e) {
    console.warn(`[BRAIN3] isInServiceArea: parse error, allowing booking — ${e.message}`);
    return true; // parse error = permissive
  }
}

// Shared decision logic for "do we have enough to judge service area, and if
// so is this address in it" — used by handleAddress, handleZipOnly, and
// handleAddressConfirm (task #88) so all three make the exact same call
// instead of each keeping its own copy that can silently drift out of sync
// (which is exactly how handleAddressConfirm missed tasks #86/#87's fixes the
// first time around — same bug, second location). Pure logic, no session
// mutation — callers decide what to update and what to say.
function resolveServiceAreaOutcome(address, contractor) {
  let contractorZipsForGate = null;
  try {
    const raw = contractor.service_zip_codes;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) && parsed.length) contractorZipsForGate = parsed;
  } catch (e) {}

  if (contractorZipsForGate && !extractZip(address)) {
    return { outcome: 'needs_zip' };
  }
  if (!isInServiceArea(address, contractor)) {
    return { outcome: 'out_of_area' };
  }
  return { outcome: 'in_area' };
}

// ── Free (no paid API) street/zip plausibility check ────────────────────────
// Live-caught gap: the system never verifies a street address actually
// corresponds to its stated/extracted zip — it only checks whether the ZIP
// NUMBER is on the contractor's covered-zips list. A real street in one city
// paired with a real-but-different city's zip (e.g. a Marysville street with
// an Arlington zip) sails straight through, since 98223 genuinely is a
// covered zip. The airtight fix is a paid geocoding lookup per address —
// explicitly rejected on cost grounds. This is the free alternative: the
// `zipcodes` package (already a dependency, fully offline, zero marginal
// cost) knows the real city/state on file for any zip. If the homeowner's
// own text names a city and it doesn't match what's on file for the zip they
// gave, that's a real, checkable mismatch signal — surface it as a soft
// heads-up rather than silently blocking, since a stated "city" is often a
// colloquial/unincorporated name that legitimately differs from the official
// USPS zip city (e.g. many "Mill Creek, WA" addresses are officially
// "Everett" per zip). This can't catch every bad pairing (it does nothing
// when no city is stated at all, which is what defeated it in Jose's own
// test), but it closes the case where a real, conflicting city IS given, at
// no ongoing cost.
function findCityZipMismatch(cityGiven, zip) {
  if (!cityGiven || !zip) return null;
  const onFile = zipcodes.lookup(zip);
  if (!onFile || !onFile.city) return null;
  const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
  const given = norm(cityGiven);
  const real = norm(onFile.city);
  if (!given) return null;
  if (given === real || given.includes(real) || real.includes(given)) return null;
  return { onFileCity: onFile.city, onFileState: onFile.state };
}

// ── Free (no cost) real address validation via US Census Bureau Geocoder ────
// findCityZipMismatch() above only helps when the homeowner's own text names a
// city — it does nothing for the exact live-caught gap it couldn't close: an
// address given with NO city at all, paired with a real-but-wrong zip (e.g.
// "1370 Cedar Ave" + "98223" — a real Marysville street next to a real but
// different Arlington zip). Google's Geocoding API would close this
// authoritatively but has a real per-lookup dollar cost, explicitly ruled out.
// The US Census Bureau's Geocoding Services API is genuinely free — no API
// key, no billing, government-run, meant for public use — and validates the
// STREET ADDRESS ITSELF against real US address data, not just a self-reported
// zip number. Fails open (resolves null = "couldn't verify, don't block") on
// any network error, timeout, or no-match — a missed catch here is far better
// than a false decline on a real, oddly-worded address the Census DB just
// doesn't have an exact match for.
function verifyAddressWithCensus(address) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };

    try {
      const query = new URLSearchParams({
        address: String(address || ''),
        benchmark: 'Public_AR_Current',
        format: 'json',
      }).toString();

      const req = https.request({
        hostname: 'geocoding.geo.census.gov',
        path: `/geocoder/locations/onelineaddress?${query}`,
        method: 'GET',
        timeout: 4000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const match = parsed?.result?.addressMatches?.[0];
            if (!match || !match.addressComponents) return done(null);
            done({
              city: match.addressComponents.city || null,
              state: match.addressComponents.state || null,
              zip: match.addressComponents.zip || null,
            });
          } catch (e) {
            console.warn('[BRAIN3] Census geocoder parse error, allowing booking:', e.message);
            done(null);
          }
        });
      });
      req.on('timeout', () => { req.destroy(); done(null); });
      req.on('error', (e) => {
        console.warn('[BRAIN3] Census geocoder request error, allowing booking:', e.message);
        done(null);
      });
      req.end();
    } catch (e) {
      console.warn('[BRAIN3] Census geocoder setup error, allowing booking:', e.message);
      done(null);
    }
  });
}

// Runs both free mismatch layers (text-stated city vs zip, then — only if the
// first found nothing — the authoritative Census street-address check) and
// returns a single soft heads-up note to prepend to the next reply, or ''
// if nothing looked off. Shared by handleAddress and handleZipOnly so the two
// entry points to "we now have a zip to check" can't drift out of sync.
async function buildAddressMismatchNote(fullAddress, cityGiven, zip) {
  if (!zip) return '';

  const textMismatch = findCityZipMismatch(cityGiven, zip);
  if (textMismatch) {
    return `Quick heads up — we have ${zip} on file as ${textMismatch.onFileCity}, ${textMismatch.onFileState}, not ${cityGiven}. Let me know if that's not right! `;
  }

  // No city was stated (or it matched fine) — fall back to the deeper,
  // network-based-but-free Census check, which can catch a mismatch even
  // with zero city text to go on.
  const censusMatch = await verifyAddressWithCensus(fullAddress);
  if (censusMatch && censusMatch.zip && censusMatch.zip !== zip) {
    const where = censusMatch.city && censusMatch.state
      ? ` (${censusMatch.city}, ${censusMatch.state})`
      : '';
    return `Quick heads up — that address looks like it matches zip ${censusMatch.zip}${where}, not ${zip}. Let me know if that's not right! `;
  }

  return '';
}

// ── Returning homeowner check ─────────────────────────────────────────────────
// Time-bounded to 180 days — carriers typically quarantine a recycled phone
// number for 90+ days before reassigning it, so anything older than that is
// meaningfully more likely to belong to a different person by now. Bounding
// this doesn't fully solve the risk on its own (a shared family phone can hit
// the same issue same-day), which is why startHomeownerSession() below also
// makes the "returning" fast-path confirm the pre-filled name/address out loud
// instead of silently trusting it — see the comment there.
async function getLastConfirmedBooking(phone, contractorId) {
  // Include 'awaiting_email' so homeowners who went dark after booking (but before
  // providing their email) are still recognized as returning on next contact.
  return db.prepare(`
    SELECT name, address, service_description
    FROM homeowner_sms_sessions
    WHERE phone = $1 AND contractor_id = $2
      AND state IN ('confirmed', 'awaiting_email')
      AND name IS NOT NULL AND address IS NOT NULL
      AND updated_at > NOW() - INTERVAL '180 days'
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(phone, contractorId);
}

// ── Graceful exit detection ───────────────────────────────────────────────────
const EXIT_RE = /^(no\s*thanks?|not\s*interested|never\s*mind|nevermind|forget\s*it|nvm|nm|no\s*need|don'?t\s*need|not\s*now|maybe\s*later|i'?m\s*good|all\s*good|no\s*worries)$/i;

// ── Restart-intent detection ──────────────────────────────────────────────────
// Live-caught bug: a homeowner asking "can we start over with my name and
// address" mid-conversation had that entire sentence folded into
// service_description (handleService's isFollowUp logic treats ANY reply while
// awaiting_service as more diagnostic detail, with no concept of "actually,
// scrap this"), which then got passed to classifyServiceScope, which had no
// way to recognize "start over" as anything other than vague-but-maybe-in-scope
// text — and fell straight through to offering appointment slots for a
// "service" that was never actually described. Not intentionally anchored to
// message start (unlike EXIT_RE) since a genuine restart request is usually
// phrased as a full sentence ("can we start over...") rather than a bare
// command, so this checks anywhere in the message.
const RESTART_RE = /\b(start\s*(over|again)|restart|redo\s*(this|that)|scratch\s*that|from\s*the\s*(beginning|top|start))\b/i;

async function callClaude(messages, tools, system) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? { type: 'auto' } : undefined,
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Claude parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Fetch open slots for next 7 days ─────────────────────────────────────────
async function getOpenSlots(contractorId) {
  const from = new Date();
  from.setDate(from.getDate() + 1); // start tomorrow
  const to   = new Date();
  to.setDate(to.getDate() + 8);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr   = to.toISOString().slice(0, 10);

  // Get weekly schedule
  const slots = await db.prepare(`
    SELECT * FROM availability_slots
    WHERE contractor_id = $1 AND is_active = 1
    ORDER BY day_of_week, start_time
  `).all(contractorId);

  // Get overrides
  const { rows: overrides } = await db.query(`
    SELECT * FROM availability_overrides
    WHERE contractor_id = $1 AND date >= $2 AND date <= $3
  `, [contractorId, fromStr, toStr]);

  // Get booked appointments
  const { rows: booked } = await db.query(`
    SELECT scheduled_date, scheduled_time FROM appointments
    WHERE contractor_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3
    AND status NOT IN ('cancelled')
  `, [contractorId, fromStr, toStr]);

  // .slice(0,5) normalizes away any trailing seconds — belt-and-suspenders so
  // older rows saved before the "HH:MM:00" bug fix above still correctly block
  // their slot instead of silently allowing a double-booking on the same time.
  const bookedSet = new Set(booked.map(b => `${b.scheduled_date}_${String(b.scheduled_time || '').slice(0, 5)}`));
  const overrideMap = {};
  for (const o of overrides) overrideMap[o.date] = o;

  // Every other booking path (bookings.js's /book and /book-direct) checks
  // contractor.max_appointments_per_day before allowing a new appointment — this
  // one never did, so a homeowner texting in through Brain 3 could push a
  // contractor past a daily cap they explicitly set in the portal. Fixed by
  // building a per-date count and refusing to offer any slot on a day that's
  // already at or over the cap.
  const { rows: maxRows } = await db.query(
    `SELECT max_appointments_per_day FROM contractors WHERE id = $1`, [contractorId]
  );
  const maxPerDay = maxRows[0]?.max_appointments_per_day || null;
  const perDateCount = {};
  if (maxPerDay) {
    for (const b of booked) perDateCount[b.scheduled_date] = (perDateCount[b.scheduled_date] || 0) + 1;
  }

  const openSlots = [];
  const cur = new Date(from);
  while (cur <= to && openSlots.length < 9) {
    const dateStr = cur.toISOString().slice(0, 10);
    const dow = cur.getDay();
    const override = overrideMap[dateStr];

    if (maxPerDay && (perDateCount[dateStr] || 0) >= maxPerDay) {
      cur.setDate(cur.getDate() + 1);
      continue; // day is already at the contractor's daily cap — offer nothing here
    }

    let daySlots = [];
    if (override) {
      if (!override.is_available) { cur.setDate(cur.getDate() + 1); continue; }
      if (override.start_time && override.end_time) {
        daySlots = [{ start_time: override.start_time, end_time: override.end_time }];
      }
    }
    if (!daySlots.length) {
      daySlots = slots.filter(s => s.day_of_week === dow);
    }

    for (const slot of daySlots) {
      // Generate hourly slots within the window
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      let hour = sh;
      while (hour < eh && openSlots.length < 9) {
        // "HH:MM" — no trailing seconds. schema.sql documents scheduled_time as
        // "HH:MM" and every other slot generator (availability.js) writes it that
        // way. This used to write "HH:MM:00" instead, which silently broke the
        // contractor portal's weekly calendar grid: the grid matches appointments
        // to hour rows with a strict "09:00" === scheduled_time comparison, so a
        // Brain-3-booked appointment stored as "09:00:00" could never match any
        // row and rendered nowhere on the grid — even though it showed up fine in
        // the Home tab's list views, which don't do that exact-match. Found live.
        const timeStr = `${String(hour).padStart(2, '0')}:${String(sm || 0).padStart(2, '0')}`;
        const key = `${dateStr}_${timeStr}`;
        if (!bookedSet.has(key)) {
          openSlots.push({ date: dateStr, time: timeStr, label: `${fmtDate(dateStr)} at ${fmtTime(timeStr)}` });
        }
        hour++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  return openSlots;
}

// ── Get or create a homeowner session ────────────────────────────────────────
async function getSession(phone, contractorId) {
  // Sessions expire after 24 hours of inactivity.
  // Excludes BOTH terminal states (task #88): 'confirmed' (a real booking
  // happened, nothing more to route) and 'ended' (conversation is over but
  // nothing was booked — opt-out, decline, no-slots, etc). 'out_of_area' is
  // deliberately NOT excluded — it stays routable for a short window so a
  // genuine follow-up question gets answered instead of restarting the
  // greeting from scratch (task #86).
  const session = await db.prepare(`
    SELECT * FROM homeowner_sms_sessions
    WHERE phone = $1 AND contractor_id = $2
    AND updated_at > NOW() - INTERVAL '24 hours'
    AND state NOT IN ('confirmed', 'ended')
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(phone, contractorId);
  return session || null;
}

async function createSession(phone, contractorId, name = null, leadId = null) {
  const id = uuidv4();
  await db.prepare(`
    INSERT INTO homeowner_sms_sessions (id, phone, contractor_id, state, name, offered_slots, lead_id)
    VALUES ($1, $2, $3, 'awaiting_address', $4, '[]', $5)
  `).run(id, phone, contractorId, name, leadId);
  return db.prepare(`SELECT * FROM homeowner_sms_sessions WHERE id = $1`).get(id);
}

async function updateSession(sessionId, updates) {
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  await db.query(
    `UPDATE homeowner_sms_sessions SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
    [sessionId, ...values]
  );
}

// ── Per-homeowner processing queue ──────────────────────────────────────────
// Same pattern as smsAI.js's _contractorProcessingQueue (built after task #66
// caught a rapid-double-text race on the contractor side) — applied here
// proactively before Brain 3 ever gets its first real live stress test,
// rather than waiting to live-catch the homeowner-side equivalent (e.g. a
// homeowner double-tapping "2" to pick a slot, which without this could fire
// two overlapping handleHomeownerSmsInner calls both reading the same
// pre-pick session state, both attempting to book, both replying). A second
// inbound action for the same phone+contractor pair now always waits for the
// first to fully finish — including its DB write — before starting, so every
// turn reads real, current state. Single-process assumption, same as the
// contractor-side queue — would need a DB-backed lock instead if this ever
// ran multi-instance.
const _homeownerProcessingQueue = new Map();
function withHomeownerQueue(phone, contractorId, fn) {
  const key = `${phone}:${contractorId}`;
  const prior = _homeownerProcessingQueue.get(key) || Promise.resolve();
  const current = prior.catch(() => {}).then(fn);
  _homeownerProcessingQueue.set(key, current);
  return current.finally(() => {
    if (_homeownerProcessingQueue.get(key) === current) {
      _homeownerProcessingQueue.delete(key);
    }
  });
}

// ── Core handler — called from twilio.js for homeowner inbound SMS ────────────
async function handleHomeownerSmsInner(phone, contractorId, incomingText, session) {
  const contractor = await db.prepare(
    `SELECT c.id, c.name, c.company_name, c.niche_id, c.phone, c.twilio_number,
            c.service_zip_codes, c.service_radius_miles, c.address, c.max_appointments_per_day,
            n.name AS niche_name
     FROM contractors c
     LEFT JOIN niches n ON n.id = c.niche_id
     WHERE c.id = $1`
  ).get(contractorId);

  if (!contractor) return null;

  const businessName = contractor.company_name || contractor.name || 'us';

  // ── Graceful exit — detect disinterest in any state ──────────────────────
  if (EXIT_RE.test(incomingText.trim())) {
    // 'ended', not 'confirmed' (task #88) — no appointment was ever booked here.
    // getLastConfirmedBooking() treats any 'confirmed' row with a name+address
    // as a real past booking, so reusing 'confirmed' for a plain opt-out risked
    // greeting this person as a returning customer next time they text in.
    await updateSession(session.id, { state: 'ended' });
    return `No problem at all! Feel free to text us anytime if you need service. Have a great day!`;
  }

  // ── Restart intent — honor it explicitly instead of folding it into
  // whatever state-specific handler happens to be active. Only recognized
  // once we're at least as far as awaiting_service or later — in
  // awaiting_address/awaiting_zip_only/awaiting_address_confirm a message
  // containing "start" is far more likely to be a real reply (e.g. "123
  // Startdale Ave") than an actual restart request, so don't risk a false
  // positive there; those states already loop back into handleAddress/
  // handleZipOnly on their own if something looks wrong.
  if (
    RESTART_RE.test(incomingText.trim()) &&
    ['awaiting_service', 'awaiting_slot', 'awaiting_email'].includes(session.state)
  ) {
    await updateSession(session.id, {
      name: null,
      address: null,
      service_description: null,
      offered_slots: null,
      state: 'awaiting_address',
    });
    return `No problem — let's start fresh. What's your name and the address that needs service?`;
  }

  // ── State routing ──────────────────────────────────────────────────────────
  if (session.state === 'awaiting_address') {
    return handleAddress(session, contractor, businessName, incomingText);
  }
  if (session.state === 'awaiting_address_confirm') {
    return handleAddressConfirm(session, contractor, businessName, incomingText);
  }
  if (session.state === 'awaiting_service') {
    return handleService(session, contractor, businessName, incomingText);
  }
  if (session.state === 'awaiting_slot') {
    return handleSlotPick(session, contractor, businessName, incomingText);
  }
  if (session.state === 'awaiting_email') {
    return handleEmail(session, contractor, businessName, incomingText);
  }
  if (session.state === 'out_of_area') {
    return handleOutOfArea(session, contractor, businessName, incomingText);
  }
  if (session.state === 'awaiting_zip_only') {
    return handleZipOnly(session, contractor, businessName, incomingText);
  }

  // Fallback — session in unknown state, restart
  await updateSession(session.id, { state: 'awaiting_address' });
  return `What address needs service?`;
}

// ── Step 1: Capture address (and name if not yet known) ──────────────────────
async function handleAddress(session, contractor, businessName, text) {
  const needsName = !session.name;

  // Use Claude Haiku to extract name + address (or just address if name already known)
  const systemWithName = `You are an assistant extracting booking info from a homeowner text message.
The homeowner was asked: "What's your name and the address that needs service?"
Extract their name, address, and city and return ONLY valid JSON: {"name": "...", "address": "...", "city": "..."}
The "address" field must contain ONLY the street address (and city/zip if given) — never include the
person's name inside the address string, even if they wrote it as "Name and 123 Main St" or
"Name, 123 Main St". Strip the name out of the address entirely.
The "city" field should contain ONLY the city name if one is mentioned anywhere in their message
(e.g. "123 Main St, Arlington" → city: "Arlington"). If no city is mentioned, use "".
If name is unclear, use "Homeowner". If no address is present, use "".
Return ONLY the JSON object. No explanation.`;

  const systemAddressOnly = `You are an address extractor. The user is responding to a question about what address needs HVAC service.
Extract the address and city from their message and return ONLY valid JSON: {"address": "...", "city": "..."}
If they gave a clear address (even partial like "123 Main St"), return it as-is in "address".
The "city" field should contain ONLY the city name if one is mentioned (e.g. "123 Main St, Arlington" → city: "Arlington"). If no city is mentioned, use "".
If the message has no address information at all, use "" for "address".
Return ONLY the JSON object. No explanation.`;

  let address = text.trim();
  let name = session.name || null;
  let cityGiven = '';
  let sawExplicitNoAddress = false; // set true whenever extraction (successful or not) determined there's no real address in this reply

  if (ANTHROPIC_API_KEY) {
    try {
      if (needsName) {
        const result = await callClaude(
          [{ role: 'user', content: text }],
          [],
          systemWithName
        );
        const raw = result.content?.[0]?.text?.trim();
        // Model occasionally wraps JSON in markdown fences or adds stray text
        // around it — extract just the {...} block before parsing so a JSON.parse
        // throw doesn't silently fall through to using the raw homeowner text
        // (e.g. "My name is Shyla") as the "address" (live-caught bug — see below).
        const jsonMatch = raw?.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        if (parsed.name && parsed.name !== 'Homeowner') name = parsed.name;
        if (parsed.address) address = parsed.address;
        if (parsed.city) cityGiven = parsed.city;
        // Safety net: even with the stricter prompt above, the model can still
        // leak the name into the address (observed live — address stored as
        // "Daniel and 19222 crown ridge blvd" alongside a correctly-parsed
        // name of "Daniel"). Strip a leading "Name and "/"Name, "/"Name - "
        // pattern off the front of the address if it starts with the name.
        if (name && address) {
          const nameEscaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const leadingNamePattern = new RegExp(`^${nameEscaped}\\s*(and|,|-|:)\\s*`, 'i');
          address = address.replace(leadingNamePattern, '').trim();
        }
        // If they only gave a name and no address, ask for address
        if (!parsed.address) {
          sawExplicitNoAddress = true;
        }
      } else {
        const result = await callClaude(
          [{ role: 'user', content: text }],
          [],
          systemAddressOnly
        );
        const raw = result.content?.[0]?.text?.trim();
        const jsonMatch = raw?.match(/\{[\s\S]*\}/);
        try {
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
          if (parsed.address) address = parsed.address;
          else sawExplicitNoAddress = true;
          if (parsed.city) cityGiven = parsed.city;
        } catch (e) {
          // Model didn't return valid JSON this turn — fall back to treating
          // the raw text as a plain address string (old behavior) rather than
          // losing the reply entirely, but skip the city extraction since we
          // can't trust unstructured text for that.
          if (raw && raw !== 'NONE') address = raw;
          else sawExplicitNoAddress = true;
        }
      }
    } catch (e) {
      console.error('[BRAIN3] Address extraction error:', e.message);
      // Live-caught bug: a JSON.parse throw here used to be swallowed silently,
      // leaving `address` at its line-490 fallback of the raw homeowner reply
      // (e.g. "My name is Shyla" was stored AS the address) and `name` still
      // unset — the function then fell straight through the now-unreachable
      // "ask for address" return, into the service-area check, and advanced
      // to awaiting_service with a garbage address. Treat any extraction
      // failure the same as "no address found" rather than trusting the
      // untouched raw text as a real address.
      sawExplicitNoAddress = true;
    }
  }

  // Final guard, independent of which path above ran: if we still don't have
  // anything that looks like a real street address (no digit in it — same
  // heuristic already used by handleAddressConfirm below), and the extraction
  // step itself flagged "no address" or simply left `address` as the raw
  // reply text, re-prompt for the address instead of silently advancing state.
  const looksLikeAddress = /\d/.test(address);
  if (sawExplicitNoAddress || !looksLikeAddress) {
    await updateSession(session.id, { name: name || session.name });
    return `Thanks ${name || ''}! And the address that needs service?`.trim();
  }

  // ── Service area check ────────────────────────────────────────────────────
  // isInServiceArea() deliberately fails open (returns true) whenever it can't
  // find a zip in the given address — fine for lower-stakes callers like the
  // public lead form (matchingEngine.js), where a human still reviews the
  // match, but Brain 3 books automatically with zero review. Live-caught: the
  // exact same out-of-area address, sent again with the zip omitted, sailed
  // straight past the check — see resolveServiceAreaOutcome() above.
  const areaCheck = resolveServiceAreaOutcome(address, contractor);

  if (areaCheck.outcome === 'needs_zip') {
    await updateSession(session.id, { name: name || session.name, address, state: 'awaiting_zip_only' });
    return `What's the zip code for that address? Just want to make sure we cover your area.`;
  }

  if (areaCheck.outcome === 'out_of_area') {
    // Live-caught bug (task #86): this used to close straight to state='confirmed',
    // which the state machine treats as fully terminal — the homeowner's very next
    // text (often a genuine follow-up like "what zip codes do you cover") had no
    // active session, so twilio.js's fallback restarted the ENTIRE generic greeting
    // from scratch instead of answering them. 'out_of_area' is still picked up by
    // getSession() (only 'confirmed'/'ended' are excluded there), so a follow-up
    // routes into handleOutOfArea() below instead of re-triggering the greeting.
    await updateSession(session.id, { name: name || session.name, state: 'out_of_area' });
    const zip = extractZip(address);
    const areaHint = zip ? `(we cover different zip codes)` : `(we don't serve that area)`;
    return `Thanks! Unfortunately we don't cover that area ${areaHint}. Hope you find help nearby soon!`;
  }

  const updates = { address, state: 'awaiting_service' };
  if (name) updates.name = name;
  await updateSession(session.id, updates);

  // Free (no paid API) address plausibility check — text-city cross-check
  // first (instant, no network), then the free Census geocoder as a deeper
  // layer if that found nothing (see buildAddressMismatchNote() above). Never
  // blocks — just surfaces a heads-up so an honest mismatch can self-correct.
  const zipForMismatchCheck = extractZip(address);
  const mismatchNote = await buildAddressMismatchNote(address, cityGiven, zipForMismatchCheck);

  // Patch the lead record if session has a lead_id
  if (session.lead_id) {
    await db.query(
      `UPDATE leads SET name = COALESCE($1, name), address = COALESCE($2, address) WHERE id = $3`,
      [name || null, address || null, session.lead_id]
    ).catch(e => console.error('[BRAIN3] Lead patch error:', e.message));
  }

  return `${mismatchNote}${getServiceQuestion(contractor.niche_name)}`;
}

// ── Step 1a-continued: zip code needed to determine service area ────────────
// Deliberately bypasses the general Claude-based address extraction — this only
// ever fires right after handleAddress saved a partial (zip-less) address and
// asked specifically for the zip, so a plain regex is both simpler and safer
// than re-running full extraction on a reply that's expected to just be digits.
async function handleZipOnly(session, contractor, businessName, text) {
  const zipMatch = (text || '').match(/\b\d{5}\b/);
  // Validate against the real zipcodes DB, not just "5 digits" — a mistyped
  // or made-up zip (e.g. "00000") shouldn't silently pass as real (task #88).
  if (!zipMatch || !isValidZip(zipMatch[0])) {
    return `Just the 5-digit zip code is all I need — what is it?`;
  }
  const zip = zipMatch[0];
  const fullAddress = session.address ? `${session.address} ${zip}` : zip;
  const areaCheck = resolveServiceAreaOutcome(fullAddress, contractor);

  if (areaCheck.outcome === 'needs_zip') {
    // Shouldn't normally happen since we just validated the zip above, but if
    // extraction still can't resolve it for some reason, don't guess — ask again.
    return `Just the 5-digit zip code is all I need — what is it?`;
  }

  if (areaCheck.outcome === 'out_of_area') {
    await updateSession(session.id, { address: fullAddress, state: 'out_of_area' });
    return `Thanks! Unfortunately we don't cover that area (we cover different zip codes). Hope you find help nearby soon!`;
  }

  await updateSession(session.id, { address: fullAddress, state: 'awaiting_service' });
  if (session.lead_id) {
    await db.query(
      `UPDATE leads SET address = COALESCE($1, address) WHERE id = $2`,
      [fullAddress, session.lead_id]
    ).catch(e => console.error('[BRAIN3] Lead patch error (zip-only):', e.message));
  }

  // This is the exact live-caught gap (task #91): a street address given with
  // no city, followed by a bare zip in a separate message. No city text
  // exists here to cross-check, so buildAddressMismatchNote() will skip
  // straight to the free Census geocoder — the only layer that can catch
  // this specific case.
  const mismatchNote = await buildAddressMismatchNote(fullAddress, '', zip);
  return `${mismatchNote}${getServiceQuestion(contractor.niche_name)}`;
}

// Builds a plain-English description of where a contractor actually serves,
// for answering a homeowner's genuine "what zip codes / areas do you cover?"
// question in handleOutOfArea() below — never guess, describe what's really set.
function describeCoverageArea(contractor) {
  try {
    const raw = contractor.service_zip_codes;
    const zips = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(zips) && zips.length && !zips.includes('*')) {
      return `We currently serve these zip codes: ${zips.join(', ')}.`;
    }
    if (Array.isArray(zips) && zips.includes('*')) {
      const radius = contractor.service_radius_miles || 25;
      return `We generally serve within about ${radius} miles of our shop.`;
    }
  } catch (e) {}
  return `We serve a specific local area — feel free to send your zip code and I can double check.`;
}

// ── Step 1c: Follow-up after an out-of-area decline ──────────────────────────
// A homeowner who was just told "we don't cover that area" often replies with
// a real question ("what zip codes do you cover?") or a corrected address
// ("oh sorry, I meant 1234 Main St") rather than going silent. This used to
// have no home in the state machine — the session closed to 'confirmed' and
// the homeowner's next text restarted the entire generic greeting from
// scratch (task #86, live-caught). Handle the realistic replies directly
// instead of forcing them back through the whole intro.
const COVERAGE_QUESTION_RE = /\b(what|which)\s+(zip|zips|zip codes?|areas?|cit(y|ies))\b|\bdo you (cover|serve|service)\b|\bservice area\b|\bwhere do you (cover|serve|service)\b|\bwhat.*(cover|serve)\b/i;

async function handleOutOfArea(session, contractor, businessName, text) {
  const trimmed = (text || '').trim();

  if (COVERAGE_QUESTION_RE.test(trimmed)) {
    // Answer the real question, but DON'T close the session (task #89,
    // live-caught): a homeowner who just asked "what zips do you cover?" very
    // naturally follows up with "oh, my address is actually X" once they hear
    // the answer — closing here meant that correction landed with no active
    // session and restarted the whole generic greeting from scratch, exactly
    // the bug task #86 was supposed to have already fixed. Stay in
    // 'out_of_area' so a follow-up correction still routes back into this
    // same handler instead of resetting the conversation.
    return `${describeCoverageArea(contractor)} Text us again anytime if that changes!`;
  }

  // Looks like they're offering a corrected/different address — same heuristic
  // used elsewhere in this file (contains a digit, reasonably long) rather than
  // silently trusting any short reply as a real address.
  if (/\d/.test(trimmed) && trimmed.length > 6) {
    await updateSession(session.id, { state: 'awaiting_address' });
    return handleAddress(session, contractor, businessName, trimmed);
  }

  // Anything else — polite close, no restart of the greeting. 'ended' not
  // 'confirmed' (task #88) — see EXIT_RE comment above for why.
  await updateSession(session.id, { state: 'ended' });
  return `No worries! Feel free to text us again anytime — happy to help if that ever changes.`;
}

// ── Step 1b: Confirm pre-filled name/address for a "returning" homeowner ─────
// A phone number that booked before gets its old name/address pre-filled as a
// convenience (see getLastConfirmedBooking), but that phone may have been
// recycled to a new owner or be shared within a household. Rather than
// silently trusting stale info for a real dispatch, this asks the homeowner
// to confirm it out loud first — same safety principle as handleAddress's
// name-leak guard above, just applied to a different failure mode.
async function handleAddressConfirm(session, contractor, businessName, text) {
  const trimmed = text.trim();
  const looksLikeYes = /^(yes|yep|yeah|yup|correct|that'?s (right|correct)|still (there|same|correct)|same (address|place)|good|confirmed?)\b/i.test(trimmed);

  if (looksLikeYes) {
    // Re-validate the pre-filled address against the CURRENT service area
    // config (task #88) instead of blindly trusting it — this address was
    // only ever checked once, at the time of their LAST booking, and a
    // contractor can shrink their coverage area in between. Shares the exact
    // same decision logic handleAddress uses so this can never drift out of
    // sync with it again the way the old hand-rolled copy below did.
    const areaCheck = resolveServiceAreaOutcome(session.address, contractor);
    if (areaCheck.outcome === 'needs_zip') {
      await updateSession(session.id, { state: 'awaiting_zip_only' });
      return `What's the zip code for that address? Just want to make sure we still cover your area.`;
    }
    if (areaCheck.outcome === 'out_of_area') {
      await updateSession(session.id, { state: 'out_of_area' });
      return `Thanks! Looks like we no longer cover that area. Hope you find help nearby soon!`;
    }
    await updateSession(session.id, { state: 'awaiting_service' });
    return getServiceQuestion(contractor.niche_name);
  }

  // Not a clear "yes" — treat as a correction if it looks like a real address,
  // by delegating straight into handleAddress (task #88) instead of keeping a
  // second, separate copy of the same zip-gate + service-area logic. That
  // duplication is exactly what let this path miss tasks #86/#87's fixes the
  // first time they were made — same bug, second location.
  if (/\d/.test(trimmed) && trimmed.length > 6) {
    return handleAddress(session, contractor, businessName, trimmed);
  }

  await updateSession(session.id, { state: 'awaiting_address' });
  return `No worries — what's the address that needs service?`;
}

// ── Step 2: Capture service type + give real diagnostic ───────────────────────
async function handleService(session, contractor, businessName, text) {
  const newText = text.trim();
  // If this is a follow-up to a scope clarifying question (below), combine it
  // with what they already told us so classification and diagnosis both have
  // the full picture instead of just the latest fragment.
  const isFollowUp = !!session.service_description;
  const serviceText = isFollowUp ? `${session.service_description} — ${newText}` : newText;

  // Save service description only — don't advance state until we confirm slots exist.
  // If we set state='awaiting_slot' before fetching, a slot-fetch failure leaves the
  // homeowner stuck in awaiting_slot with an empty offered_slots array.
  await updateSession(session.id, { service_description: serviceText });

  // ── Scope check — does this contractor's niche actually cover this? ────────
  // Runs BEFORE fetching/offering slots, and BEFORE state is touched, so a
  // homeowner never gets booked for a job type this business doesn't do. See
  // classifyServiceScope() above for why this exists as an explicit gate.
  const { scope, message: scopeMessage } = await classifyServiceScope(contractor.niche_name, serviceText);

  if (scope === 'out_of_scope') {
    await updateSession(session.id, { state: 'ended' }); // close session — don't offer slots for work we don't do (task #88: 'ended' not 'confirmed', no booking happened)
    return (scopeMessage || `That's not something we handle, unfortunately — hope you find the right pro for it!`).slice(0, MAX_CHARS);
  }

  if (scope === 'unclear') {
    // Stay in awaiting_service (state untouched) — their next reply routes
    // straight back into this function and gets combined with this message
    // via the isFollowUp logic above, then re-classified.
    return (scopeMessage || `Just to make sure I get you booked with the right person — can you tell me a bit more about what's going on?`).slice(0, MAX_CHARS);
  }

  // scope === 'in_scope' (or the classifier failed and we failed open) — proceed as before
  // Fetch slots in parallel with diagnostic retrieval
  const [slots, knowledgeChunks] = await Promise.all([
    getOpenSlots(contractor.id),
    getRelevantKnowledge(serviceText, contractor.niche_name || 'HVAC').catch(err => {
      // Was completely silent before — if Voyage AI goes down or rate-limits,
      // every homeowner conversation was silently losing its diagnostic knowledge
      // with zero operator visibility. Now at least logged.
      console.warn(`[BRAIN3] getRelevantKnowledge failed, continuing without diagnostic knowledge: ${err.message}`);
      return '';
    }),
  ]);

  // Build the slot options string
  if (!slots.length) {
    await updateSession(session.id, { state: 'ended' }); // task #88: 'ended' not 'confirmed', no booking happened
    return `We're fully booked right now — text us again in a few days and we'll get you scheduled. Reply STOP to opt out.`;
  }

  const offered = slots.slice(0, 3);
  // Now safe to advance state — offered_slots and state set together atomically
  await updateSession(session.id, {
    offered_slots: JSON.stringify(offered),
    state: 'awaiting_slot',
  });

  const slotOptions = formatSlotOptionsBlock(offered);

  // If we have diagnostic knowledge and Claude is available, generate a real diagnostic
  if (knowledgeChunks && ANTHROPIC_API_KEY) {
    try {
      const diagnosticSystem = `You are the scheduling assistant for ${businessName}. A homeowner just described their problem.
Your job: give a brief, honest, expert diagnostic response (1-2 sentences max) then naturally transition to offering appointment times.

KNOWLEDGE BASE — use this to give a real answer:
${knowledgeChunks}

SAFETY RULES (hardcoded — check these first):
- Gas smell / rotten egg: Tell them to leave the home immediately and call gas company or 911. DO NOT book an appointment.
- CO detector going off: Tell them to evacuate and call 911 first.
- Smoke or sparks: Tell them to turn off at the breaker, evacuate if needed, call 911.

FORMATTING:
- Max 320 characters total (diagnosis + slot offer combined)
- No markdown, no asterisks, plain SMS text
- Warm, human tone — not robotic, not salesy
- List each of the 3 available times on its OWN LINE using real line breaks (not run together in one paragraph) — a homeowner reading this on their phone should see a clean vertical list, e.g.:
1) Wed, Aug 5 at 8:30 AM
2) Thu, Aug 6 at 10:00 AM
3) Fri, Aug 7 at 2:00 PM
- After the list, end with exactly one short line: "${SLOT_REPLY_INSTRUCTION}" — never imply the number is the only valid way to answer, a homeowner can also just say the day or time in plain words.
- If it's a serious safety issue, DO NOT include slot options — just the safety instruction.

SLOTS AVAILABLE:
${slotOptions}`;

      const result = await callClaude(
        [{ role: 'user', content: serviceText }],
        [],
        diagnosticSystem
      );

      const reply = result.content?.[0]?.text?.trim();
      if (reply && reply.length > 0) {
        // Safety check: if the reply tells them to leave/call 911, don't add slots
        const isSafetyOverride = /911|leave.*home|evacuate|gas company/i.test(reply);
        if (isSafetyOverride) {
          await updateSession(session.id, { state: 'ended' }); // end session on safety (task #88: 'ended' not 'confirmed', no booking happened)
          return reply.slice(0, MAX_CHARS);
        }
        return reply.slice(0, MAX_CHARS);
      }
    } catch (e) {
      console.error('[BRAIN3] Diagnostic generation error:', e.message);
    }
  }

  // Fallback if no knowledge / Claude unavailable
  return `Got it. Here's what's open this week:\n${slotOptions}\n${SLOT_REPLY_INSTRUCTION} If none of these work, just say so and I'll find other times.`;
}

// ── Step 3: Confirm slot pick ─────────────────────────────────────────────────
async function handleSlotPick(session, contractor, businessName, text) {
  let offeredSlots = [];
  try {
    const raw = session.offered_slots;
    offeredSlots = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch (e) {}

  // Parse reply — a bare number still works, but so does "Tuesday", "the 8:30
  // one", "wednesday works", etc. (task #85 — see matchSlotFromText above).
  const pick = text.trim();
  const chosen = matchSlotFromText(pick, offeredSlots);

  if (!chosen) {
    // If they're telling us none of the offered times work, fetch a fresh batch
    // instead of just repeating the same three they already rejected.
    const saysNoneWork = /\b(none|nothing|neither|don'?t work|doesn'?t work|no good|can'?t do|not work)\b/i.test(pick);
    if (saysNoneWork) {
      try {
        const freshSlots = await getOpenSlots(contractor.id);
        const alreadyOffered = new Set(offeredSlots.map(s => `${s.date}_${s.time}`));
        const newBatch = freshSlots.filter(s => !alreadyOffered.has(`${s.date}_${s.time}`)).slice(0, 3);
        if (!newBatch.length) {
          return `I don't have any other openings right now — is there a day or time of day that generally works best for you? I'll see what I can find.`;
        }
        await updateSession(session.id, { offered_slots: JSON.stringify(newBatch) });
        return `No problem — here are a few other times:\n${formatSlotOptionsBlock(newBatch)}\n${SLOT_REPLY_INSTRUCTION}`;
      } catch (e) {
        console.error('[BRAIN3] Re-offer on "none work" failed:', e.message);
      }
    }
    return `Just let me know which of these works for you:\n${formatSlotOptionsBlock(offeredSlots)}\n${SLOT_REPLY_INSTRUCTION} If none of those work, just say so and I'll find other times.`;
  }

  // ── Book the appointment ────────────────────────────────────────────────────
  try {
    const name = session.name || 'Homeowner';
    let leadId = session.lead_id || null;

    if (leadId) {
      // Lead already created (phone-only form path) — just update status + fill in name/address
      await db.query(
        `UPDATE leads SET status = 'matched', assigned_contractor_id = $1,
         name = COALESCE(NULLIF($2,'Homeowner'), name),
         address = COALESCE($3, address)
         WHERE id = $4`,
        [contractor.id, name, session.address || null, leadId]
      );
    } else {
      // Create lead (missed call / van wrap / Facebook Lead Ad / direct SMS path)
      const niche = await db.prepare(`SELECT id FROM niches WHERE id = $1`).get(contractor.niche_id);
      const nicheId = niche?.id || (await db.prepare(`SELECT id FROM niches WHERE name = 'HVAC'`).get())?.id;
      if (!nicheId) throw new Error('No niche found');

      leadId = uuidv4();
      await db.prepare(`
        INSERT INTO leads
          (id, name, email, phone, niche_id, zip_code, address, description, status, assigned_contractor_id, source_site)
        VALUES
          ($1, $2, NULL, $3, $4, 'sms', $5, $6, 'matched', $7, 'sms_brain3')
      `).run(
        leadId,
        name,
        session.phone,
        nicheId,
        session.address || '',
        session.service_description || 'HVAC service',
        contractor.id
      );
    }

    // Race-safe recheck of the daily cap right before inserting — getOpenSlots()
    // already excludes full days when it builds the offer, but the offer could be
    // stale by the time this reply arrives (another booking landed in between).
    // Mirrors the same check bookings.js runs on every other booking path.
    if (contractor.max_appointments_per_day) {
      const { rows: countRows } = await db.query(
        `SELECT COUNT(*) AS cnt FROM appointments WHERE contractor_id = $1 AND scheduled_date = $2 AND status NOT IN ('cancelled')`,
        [contractor.id, chosen.date]
      );
      if (parseInt(countRows[0].cnt) >= contractor.max_appointments_per_day) {
        const freshSlots = await getOpenSlots(contractor.id);
        if (!freshSlots.length) {
          return `Looks like that day just filled up — I don't have any other openings right now. Text us again in a few days.`;
        }
        const b = freshSlots.slice(0, 3);
        await updateSession(session.id, { offered_slots: JSON.stringify(b) });
        return `That day just filled up — here are some other times:\n${formatSlotOptionsBlock(b)}\n${SLOT_REPLY_INSTRUCTION}`;
      }
    }

    // Create appointment
    const apptId = uuidv4();
    await db.query(`
      INSERT INTO appointments
        (id, lead_id, contractor_id, scheduled_date, scheduled_time, status, booking_source)
      VALUES
        ($1, $2, $3, $4, $5, 'confirmed', 'sms_brain3')
    `, [apptId, leadId, contractor.id, chosen.date, chosen.time]);

    // Transition to email capture before final close
    await updateSession(session.id, { state: 'awaiting_email', lead_id: leadId });

    // Alert Jose + contractor
    try {
      const notifications = require('./notifications');
      const apptForAlert = {
        id: apptId,
        scheduled_date: chosen.date,
        scheduled_time: chosen.time,
        booking_source: 'sms_brain3',
      };
      const homeowner = { name, phone: session.phone, address: session.address };
      // Fire booking alert to Jose
      await notifications.sendTrialBookingAlertToJose({
        contractor,
        homeowner,
        date: chosen.date,
        time: chosen.time,
        bookingSource: 'sms_brain3',
        bookingNumber: null,
      }).catch(e => console.error('[BRAIN3] Jose alert failed:', e.message));
    } catch (e) {
      console.error('[BRAIN3] Notification error:', e.message);
    }

    // SMS contractor
    try {
      const twilio = require('twilio');
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && contractor.twilio_number) {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const addr = session.address || 'no address given yet — ask the customer for it';
        const mapsLink = session.address
          ? `maps.apple.com/?daddr=${encodeURIComponent(session.address)}`
          : null;
        let contractorMsg = `New job booked! ${name} needs service on ${fmtDate(chosen.date)} at ${fmtTime(chosen.time)}. Address: ${addr}. Their number: ${fmtPhone(session.phone)}.`;
        if (mapsLink) contractorMsg += ` Tap for directions: ${mapsLink}`;
        await client.messages.create({
          to: contractor.phone,
          from: contractor.twilio_number,
          body: contractorMsg.slice(0, 500),
        });
      }
    } catch (e) {
      console.error('[BRAIN3] Contractor SMS alert failed:', e.message);
    }

    const addrPart = session.address ? ` at ${session.address}` : '';
    return `Confirmed! ${businessName} will be there${addrPart} on ${fmtDate(chosen.date)} at ${fmtTime(chosen.time)}. Want a confirmation email? Reply with your email or SKIP.`;

  } catch (err) {
    // 23505 = PostgreSQL unique_violation — slot was taken by another homeowner
    // between when we offered it and when they replied. Re-offer fresh slots instead
    // of returning a generic error that leaves them with nothing.
    if (err.code === '23505') {
      console.warn('[BRAIN3] Slot conflict (23505) — re-offering fresh slots');
      try {
        const freshSlots = await getOpenSlots(contractor.id);
        if (!freshSlots.length) {
          await updateSession(session.id, { state: 'ended' }); // task #88: 'ended' not 'confirmed', no booking happened
          return `Sorry — that slot just got taken and we're fully booked right now. Text us again in a few days and we'll get you on the calendar. Reply STOP to opt out.`;
        }
        const newOffered = freshSlots.slice(0, 3);
        await updateSession(session.id, { offered_slots: JSON.stringify(newOffered) });
        return `Sorry — that time just got booked by someone else. Here are a few other openings:\n${formatSlotOptionsBlock(newOffered)}\n${SLOT_REPLY_INSTRUCTION}`;
      } catch (retryErr) {
        console.error('[BRAIN3] Re-offer failed:', retryErr.message);
      }
    }
    console.error('[BRAIN3] Booking error:', err.message);
    return `Something went wrong on our end — we'll reach out to confirm your appointment. Sorry about that!`;
  }
}

// ── Step 4: Capture email (optional) ────────────────────────────────────────
async function handleEmail(session, contractor, businessName, text) {
  const input = text.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const skipWords  = /^(skip|no|nope|none|n\/a|na)$/i;

  const socialReply = /^(thanks?|ok|okay|great|sounds?\s*good|perfect|awesome|got\s*it|👍|thx|ty|yep|yup|sure|cool|nice|wonderful)$/i;

  if (skipWords.test(input) || socialReply.test(input)) {
    await updateSession(session.id, { state: 'confirmed' });
    return `No problem! Your booking is confirmed. ${businessName} will remind you the morning of your appointment. Reply STOP to opt out.`;
  }

  if (!emailRegex.test(input)) {
    // Not a valid email and not a skip/social word — ask once more
    return `Just reply with your email address or SKIP if you'd rather not.`;
  }

  // Valid email — save and send confirmation
  await updateSession(session.id, { state: 'confirmed', email: input });

  if (session.lead_id) {
    db.query(`UPDATE leads SET email = $1 WHERE id = $2`, [input, session.lead_id])
      .catch(e => console.error('[BRAIN3] Email save error:', e.message));
  }

  // Look up the appointment to populate the confirmation email
  try {
    const appt = await db.prepare(`
      SELECT scheduled_date, scheduled_time
      FROM appointments
      WHERE lead_id = $1 AND contractor_id = $2 AND status = 'confirmed'
      ORDER BY created_at DESC LIMIT 1
    `).get(session.lead_id, contractor.id);

    if (appt) {
      const notifications = require('./notifications');
      notifications.sendBrain3BookingConfirmation({
        to: input,
        name: session.name || '', // '' (not a fake fallback like 'there') — sendBrain3BookingConfirmation hides the Name row entirely when blank
        businessName,
        date: fmtDate(appt.scheduled_date),
        time: fmtTime(appt.scheduled_time),
        address: session.address || '',
      }).catch(e => console.error('[BRAIN3] Confirmation email error:', e.message));

      return `Done! Confirmation sent to ${input}. See you ${fmtDate(appt.scheduled_date)} at ${fmtTime(appt.scheduled_time)}. Reply STOP to opt out.`;
    }
  } catch (e) {
    console.error('[BRAIN3] Email confirmation lookup error:', e.message);
  }

  return `Done! Check ${input} for your confirmation. Reply STOP to opt out.`;
}

// ── Public: start a new homeowner session ─────────────────────────────────────
// Called from twilio.js (missed call), facebook.js (Lead Ad), and leads.js (phone-only form)
// Detects returning homeowners and pre-populates name + address.
async function startHomeownerSession(phone, contractorId, name = null, leadId = null) {
  return withHomeownerQueue(phone, contractorId, () => startHomeownerSessionInner(phone, contractorId, name, leadId));
}

async function startHomeownerSessionInner(phone, contractorId, name = null, leadId = null) {
  // Kill any stale session for this phone + contractor first. Sets 'ended', not
  // 'confirmed' (task #88) — an abandoned/incomplete session being superseded
  // here is NOT a real booking, and getLastConfirmedBooking() treats any
  // 'confirmed' row with a name+address as a real past booking. Reusing
  // 'confirmed' here meant a homeowner who, say, gave their name+address and
  // then went dark mid-conversation could get greeted as a "returning
  // customer" on their next contact even though nothing was ever booked.
  await db.query(`
    UPDATE homeowner_sms_sessions
    SET state = 'ended', updated_at = NOW()
    WHERE phone = $1 AND contractor_id = $2 AND state NOT IN ('confirmed', 'ended')
  `, [phone, contractorId]).catch(() => {});

  // Returning homeowner check — if they've booked before, pre-populate name +
  // address but do NOT skip straight to service. state='awaiting_address_confirm'
  // makes the caller ask "still at [address]?" before that address is ever used
  // for a real dispatch — see getLastConfirmedBooking's comment for why (recycled
  // or shared phone numbers can otherwise get a stranger's old address used).
  const lastBooking = await getLastConfirmedBooking(phone, contractorId);
  if (lastBooking && lastBooking.name && lastBooking.address) {
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO homeowner_sms_sessions
        (id, phone, contractor_id, state, name, address, offered_slots, lead_id)
      VALUES ($1, $2, $3, 'awaiting_address_confirm', $4, $5, '[]', $6)
    `).run(id, phone, contractorId, lastBooking.name, lastBooking.address, leadId);
    return { isReturning: true, ...(await db.prepare(`SELECT * FROM homeowner_sms_sessions WHERE id = $1`).get(id)) };
  }

  const session = await createSession(phone, contractorId, name, leadId);
  return { isReturning: false, ...session };
}

// ── Public: get active session ────────────────────────────────────────────────
async function getActiveSession(phone, contractorId) {
  return getSession(phone, contractorId);
}

// ── Public: route an inbound homeowner SMS ────────────────────────────────────
// Fetches session INSIDE the queued closure, not before it — if this fetched
// session outside the queue and handed it in, a second rapid text could still
// queue up behind the first but carry a now-stale pre-pick session object
// with it, defeating the whole point of serializing the two calls.
async function routeHomeownerSms(phone, contractorId, text) {
  return withHomeownerQueue(phone, contractorId, async () => {
    const session = await getSession(phone, contractorId);
    if (!session) return null; // No active session — caller handles fallback
    return handleHomeownerSmsInner(phone, contractorId, text, session);
  });
}

// ── Public: start a rebook session after cancellation ────────────────────────
// Pre-populates name, address, service from the lead and jumps straight to
// slot selection. Returns the SMS text to send, or null if no slots available.
async function startRebookSession(phone, contractorId, lead) {
  return withHomeownerQueue(phone, contractorId, () => startRebookSessionInner(phone, contractorId, lead));
}

async function startRebookSessionInner(phone, contractorId, lead) {
  // Expire any existing session — 'ended' not 'confirmed' (task #88), same
  // reasoning as startHomeownerSessionInner above.
  await db.query(`
    UPDATE homeowner_sms_sessions
    SET state = 'ended', updated_at = NOW()
    WHERE phone = $1 AND contractor_id = $2 AND state NOT IN ('confirmed', 'ended')
  `, [phone, contractorId]).catch(() => {});

  // Fetch open slots
  const slots = await getOpenSlots(contractorId);
  if (!slots.length) return null; // No slots — caller falls back to email

  const offered = slots.slice(0, 3);
  const sessionId = uuidv4();
  await db.prepare(`
    INSERT INTO homeowner_sms_sessions
      (id, phone, contractor_id, state, name, address, service_description, offered_slots, lead_id)
    VALUES ($1, $2, $3, 'awaiting_slot', $4, $5, $6, $7, $8)
  `).run(
    sessionId, phone, contractorId,
    lead.name || null,
    lead.address || null,
    'rebooking',
    JSON.stringify(offered),
    lead.id || null,
  );

  return `Want to get rebooked? Here are the next available times:\n${formatSlotOptionsBlock(offered)}\n${SLOT_REPLY_INSTRUCTION}`;
}

module.exports = {
  startHomeownerSession,
  getActiveSession,
  routeHomeownerSms,
  startRebookSession,
  getLastConfirmedBooking,
};
