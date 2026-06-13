const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const notifications = require('./notifications');

const BOOKING_LINK_EXPIRY_HOURS = 24;

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

  const eligible = contractors.filter(c => {
    try {
      const zips = JSON.parse(c.service_zip_codes);
      return zips.includes(lead.zip_code) || zips.includes('*');
    } catch { return false; }
  });

  if (!eligible.length) {
    console.log(`No contractors for niche ${lead.niche_name} in zip ${lead.zip_code}`);
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
    notifications.notifyContractor(contractor, lead),
  ]);

  console.log(`📧 Notifications sent for lead ${leadId}`);
}

async function matchAndNotify(leadId) {
  const matched = await matchOnly(leadId);
  if (matched) await sendMatchNotifications(leadId);
  return matched;
}

module.exports = { matchOnly, sendMatchNotifications, matchAndNotify };
