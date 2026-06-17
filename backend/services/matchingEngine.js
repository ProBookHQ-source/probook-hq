const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const notifications = require('./notifications');
const zipcodes = require('zipcodes');
const { logEvent } = require('./auditLog');

// ── Haversine distance (miles) ────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns true if a contractor serves a given zip code.
// Logic: exact zip match (fast) OR radius match if contractor has service_radius_miles set.
function contractorServesZip(contractor, leadZip) {
  try {
    const zips = JSON.parse(contractor.service_zip_codes);
    if (zips.includes(leadZip) || zips.includes('*')) return true;

    // Radius fallback — only if contractor opted in with a radius
    const radius = contractor.service_radius_miles;
    if (!radius) return false;

    const leadLoc = zipcodes.lookup(leadZip);
    if (!leadLoc) return false;

    return zips.some(zip => {
      const loc = zipcodes.lookup(zip);
      if (!loc) return false;
      return haversine(leadLoc.latitude, leadLoc.longitude, loc.latitude, loc.longitude) <= radius;
    });
  } catch {
    return false;
  }
}

const BOOKING_LINK_EXPIRY_HOURS = 48;

async function matchOnly(leadId) {
  const lead = await db.prepare(`
    SELECT l.*, n.name as niche_name
    FROM leads l
    JOIN niches n ON l.niche_id = n.id
    WHERE l.id = $1
  `).get(leadId);

  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.status !== 'new') return false;

  const contractors = await db.prepare(`
    SELECT * FROM contractors WHERE niche_id = $1 AND is_active = 1
  `).all(lead.niche_id);

  const eligible = contractors.filter(c => contractorServesZip(c, lead.zip_code));

  if (!eligible.length) {
    console.log(`No contractors for niche ${lead.niche_name} in zip ${lead.zip_code}`);
    logEvent(lead.id, 'no_match', 'system', `No eligible contractors for niche ${lead.niche_name} in zip ${lead.zip_code}`);
    return false;
  }

  const state = await db.prepare(
    'SELECT * FROM round_robin_state WHERE niche_id = $1 AND zip_code = $2'
  ).get(lead.niche_id, lead.zip_code);

  let selected;
  if (!state || !state.last_contractor_id) {
    selected = eligible[0];
  } else {
    const lastIdx = eligible.findIndex(c => c.id === state.last_contractor_id);
    selected = eligible[(lastIdx + 1) % eligible.length];
  }

  if (state) {
    await db.prepare(
      'UPDATE round_robin_state SET last_contractor_id = $1, updated_at = NOW() WHERE niche_id = $2 AND zip_code = $3'
    ).run(selected.id, lead.niche_id, lead.zip_code);
  } else {
    await db.prepare(
      'INSERT INTO round_robin_state (id, niche_id, zip_code, last_contractor_id) VALUES ($1, $2, $3, $4)'
    ).run(uuidv4(), lead.niche_id, lead.zip_code, selected.id);
  }

  await db.prepare(
    "UPDATE leads SET assigned_contractor_id = $1, status = 'matched' WHERE id = $2"
  ).run(selected.id, lead.id);

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + BOOKING_LINK_EXPIRY_HOURS * 3600 * 1000);

  await db.prepare(
    'INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)'
  ).run(uuidv4(), lead.id, token, expiresAt);

  console.log(`✅ Matched lead ${lead.id} → ${selected.name}`);
  logEvent(lead.id, 'matched', 'system', `Matched to ${selected.name} (${selected.id})`);
  return true;
}

async function sendMatchNotifications(leadId) {
  const lead = await db.prepare(`
    SELECT l.*, n.name as niche_name
    FROM leads l
    JOIN niches n ON l.niche_id = n.id
    WHERE l.id = $1
  `).get(leadId);

  if (!lead || !lead.assigned_contractor_id) return;

  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1')
    .get(lead.assigned_contractor_id);
  if (!contractor) return;

  const tokenRow = await db.prepare(
    'SELECT token FROM booking_tokens WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1'
  ).get(lead.id);
  if (!tokenRow) return;

  const bookingUrl = `${process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app'}/book/${tokenRow.token}`;

  await Promise.allSettled([
    notifications.sendBookingLink(lead, contractor, bookingUrl),
  ]);

  console.log(`📧 Notifications sent for lead ${leadId}`);
  logEvent(leadId, 'link_sent', 'system', `Booking link sent to ${lead.email}`);
}

async function matchAndNotify(leadId) {
  const matched = await matchOnly(leadId);
  if (matched) await sendMatchNotifications(leadId);
  return matched;
}

// ── Reassign a lead, skipping the contractor who already had it ───────────────
async function reassign(leadId, excludeContractorId) {
  const lead = await db.prepare(`
    SELECT l.*, n.name as niche_name
    FROM leads l
    JOIN niches n ON l.niche_id = n.id
    WHERE l.id = $1
  `).get(leadId);

  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const contractors = await db.prepare(
    'SELECT * FROM contractors WHERE niche_id = $1 AND is_active = 1'
  ).all(lead.niche_id);

  // Eligible and not the excluded contractor
  const eligible = contractors.filter(c =>
    c.id !== excludeContractorId && contractorServesZip(c, lead.zip_code)
  );

  if (!eligible.length) return false;

  // Pick next in round-robin after excluded contractor
  const state = await db.prepare(
    'SELECT * FROM round_robin_state WHERE niche_id = $1 AND zip_code = $2'
  ).get(lead.niche_id, lead.zip_code);

  let selected;
  if (!state || !state.last_contractor_id) {
    selected = eligible[0];
  } else {
    const lastIdx = eligible.findIndex(c => c.id === state.last_contractor_id);
    selected = eligible[(lastIdx + 1) % eligible.length];
  }

  // Update round-robin state
  if (state) {
    await db.prepare(
      'UPDATE round_robin_state SET last_contractor_id = $1, updated_at = NOW() WHERE niche_id = $2 AND zip_code = $3'
    ).run(selected.id, lead.niche_id, lead.zip_code);
  } else {
    await db.prepare(
      'INSERT INTO round_robin_state (id, niche_id, zip_code, last_contractor_id) VALUES ($1, $2, $3, $4)'
    ).run(uuidv4(), lead.niche_id, lead.zip_code, selected.id);
  }

  // Expire old booking tokens
  await db.prepare('UPDATE booking_tokens SET used = 1 WHERE lead_id = $1').run(leadId);

  // Assign new contractor + create new token
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
  await db.prepare(
    "UPDATE leads SET assigned_contractor_id = $1, status = 'matched' WHERE id = $2"
  ).run(selected.id, leadId);
  await db.prepare(
    'INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)'
  ).run(uuidv4(), leadId, token, expiresAt);

  console.log(`🔄 Reassigned lead ${leadId} → ${selected.name} (skipped ${excludeContractorId})`);
  return true;
}

module.exports = { matchOnly, sendMatchNotifications, matchAndNotify, reassign };
