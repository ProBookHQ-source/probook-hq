/**
 * Matching Engine
 * ───────────────
 * When a new lead comes in:
 *   1. Find all active contractors covering that niche + zip code
 *   2. Pick the next one via round-robin (tracked in DB so it persists across restarts)
 *   3. Assign the lead to that contractor
 *   4. Send the homeowner a booking link via email
 *   5. Notify the contractor they have a new lead
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const notifications = require('./notifications');

const BOOKING_LINK_EXPIRY_HOURS = 48;

/**
 * matchOnly — fast synchronous matching (DB only, no email).
 * Returns true if a contractor was found and lead status set to 'matched'.
 */
async function matchOnly(leadId) {
  const lead = db.prepare(`
    SELECT l.*, n.name as niche_name
    FROM leads l
    JOIN niches n ON l.niche_id = n.id
    WHERE l.id = ?
  `).get(leadId);

  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.status !== 'new') return false; // already processed

  // ── 1. Find eligible contractors ─────────────────────────────────────────
  const contractors = db.prepare(`
    SELECT * FROM contractors
    WHERE niche_id = ? AND is_active = 1
  `).all(lead.niche_id);

  const eligible = contractors.filter(c => {
    try {
      const zips = JSON.parse(c.service_zip_codes);
      return zips.includes(lead.zip_code) || zips.includes('*');
    } catch {
      return false;
    }
  });

  if (!eligible.length) {
    console.log(`No contractors available for niche ${lead.niche_name} in zip ${lead.zip_code}`);
    return false;
  }

  // ── 2. Round-robin selection ──────────────────────────────────────────────
  const state = db.prepare(
    'SELECT * FROM round_robin_state WHERE niche_id = ? AND zip_code = ?'
  ).get(lead.niche_id, lead.zip_code);

  let selectedContractor;
  if (!state || !state.last_contractor_id) {
    selectedContractor = eligible[0];
  } else {
    const lastIdx = eligible.findIndex(c => c.id === state.last_contractor_id);
    selectedContractor = eligible[(lastIdx + 1) % eligible.length];
  }

  if (state) {
    db.prepare(
      'UPDATE round_robin_state SET last_contractor_id = ?, updated_at = datetime(\'now\') WHERE niche_id = ? AND zip_code = ?'
    ).run(selectedContractor.id, lead.niche_id, lead.zip_code);
  } else {
    db.prepare(
      'INSERT INTO round_robin_state (id, niche_id, zip_code, last_contractor_id, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
    ).run(uuidv4(), lead.niche_id, lead.zip_code, selectedContractor.id);
  }

  // ── 3. Assign lead & generate booking token ───────────────────────────────
  db.prepare(`
    UPDATE leads SET assigned_contractor_id = ?, status = 'matched' WHERE id = ?
  `).run(selectedContractor.id, lead.id);

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + BOOKING_LINK_EXPIRY_HOURS * 3600 * 1000)
    .toISOString().replace('T', ' ').split('.')[0];

  db.prepare(`
    INSERT INTO booking_tokens (id, lead_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), lead.id, token, expiresAt);

  console.log(`✅ Matched lead ${lead.id} → ${selectedContractor.name}`);
  return true;
}

/**
 * sendMatchNotifications — fires emails after the HTTP response has already
 * been sent. Never blocks the client.
 */
async function sendMatchNotifications(leadId) {
  const lead = db.prepare(`
    SELECT l.*, n.name as niche_name
    FROM leads l
    JOIN niches n ON l.niche_id = n.id
    WHERE l.id = ?
  `).get(leadId);

  if (!lead || !lead.assigned_contractor_id) return;

  const contractor = db.prepare('SELECT * FROM contractors WHERE id = ?')
    .get(lead.assigned_contractor_id);

  if (!contractor) return;

  const tokenRow = db.prepare(
    'SELECT token FROM booking_tokens WHERE lead_id = ? ORDER BY rowid DESC LIMIT 1'
  ).get(lead.id);

  if (!tokenRow) return;

  const bookingUrl = `${process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app'}/book/${tokenRow.token}`;

  await Promise.allSettled([
    notifications.sendBookingLink(lead, contractor, bookingUrl),
    notifications.notifyContractor(contractor, lead),
  ]);

  console.log(`📧 Notifications sent for lead ${leadId}`);
}

/** Legacy: kept for the admin re-match endpoint */
async function matchAndNotify(leadId) {
  const matched = await matchOnly(leadId);
  if (matched) await sendMatchNotifications(leadId);
  return matched;
}

module.exports = { matchOnly, sendMatchNotifications, matchAndNotify };
