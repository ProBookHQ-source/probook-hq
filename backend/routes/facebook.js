/**
 * facebook.js — Facebook Lead Ads webhook
 *
 * When Jose runs a Lead Ad campaign for a contractor on Facebook, homeowners
 * submit a pre-filled form without leaving the app. Facebook fires a webhook
 * here within seconds. Tractify retrieves the lead data from the Graph API,
 * creates the lead, and texts the homeowner an instant booking link from the
 * contractor's Twilio number — all before the homeowner has put their phone down.
 *
 * Setup (per contractor):
 *   1. In Facebook Business Manager, create a Lead Ad campaign for the contractor
 *   2. In the Lead Ad form, add a hidden field: name="contractor_slug", value="{their slug}"
 *   3. In App Settings → Webhooks, point leadgen events to:
 *      https://tractifyhq.com/api/leads/facebook
 *      Verify token = FB_VERIFY_TOKEN env var
 *   4. Ensure FB_PAGE_ACCESS_TOKEN is set in Railway
 *
 * Railway env vars needed:
 *   FB_PAGE_ACCESS_TOKEN  — Page-level token from Jose's Business Manager (never expires if set up correctly)
 *   FB_VERIFY_TOKEN       — Any secret string Jose chooses (used for webhook verification only)
 *   FB_APP_SECRET         — (Optional) App secret for X-Hub-Signature-256 validation
 */

const express  = require('express');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db       = require('../database/db');

const router   = express.Router();

// ── GET /api/leads/facebook — Webhook verification ───────────────────────────
// Facebook sends this GET request when Jose registers the webhook in
// App Settings → Webhooks. Must echo back hub.challenge to confirm ownership.
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    console.log('[FACEBOOK] Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('[FACEBOOK] Webhook verification failed — check FB_VERIFY_TOKEN');
  res.status(403).send('Forbidden');
});

// ── POST /api/leads/facebook — Lead Ad submission ────────────────────────────
// Facebook fires this within seconds of a homeowner submitting a Lead Ad form.
// Always respond 200 immediately — Facebook retries if it doesn't hear back fast.
router.post('/', async (req, res) => {

  // Optional signature validation — prevents spoofed webhook calls
  if (process.env.FB_APP_SECRET) {
    const sig      = req.headers['x-hub-signature-256'] || '';
    const expected = 'sha256=' + crypto
      .createHmac('sha256', process.env.FB_APP_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (sig !== expected) {
      console.warn('[FACEBOOK] Invalid X-Hub-Signature-256 — possible spoofed request');
      return res.status(200).send('OK'); // Still 200 — don't leak info to attackers
    }
  }

  // Respond to Facebook immediately — process async
  res.status(200).send('OK');

  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;
        const { leadgen_id, page_id } = change.value;
        console.log(`[FACEBOOK] Lead received — leadgen_id: ${leadgen_id}, page_id: ${page_id}`);
        await processLead(leadgen_id, page_id).catch(err =>
          console.error(`[FACEBOOK] processLead error for ${leadgen_id}:`, err.message)
        );
      }
    }
  } catch (err) {
    console.error('[FACEBOOK] Webhook handler error:', err.message);
  }
});

// ── Core lead processing ──────────────────────────────────────────────────────
async function processLead(leadgenId, pageId) {
  if (!process.env.FB_PAGE_ACCESS_TOKEN) {
    console.warn('[FACEBOOK] FB_PAGE_ACCESS_TOKEN not set — cannot retrieve lead data');
    return;
  }

  // ── Step 1: Fetch lead data from Graph API ──────────────────────────────────
  const graphUrl = `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data&access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`;
  const response = await fetch(graphUrl);

  if (!response.ok) {
    const text = await response.text();
    console.error(`[FACEBOOK] Graph API error ${response.status}:`, text);
    return;
  }

  const data = await response.json();

  if (data.error) {
    console.error('[FACEBOOK] Graph API returned error:', data.error);
    return;
  }

  // ── Step 2: Parse field_data array → flat object ────────────────────────────
  // Facebook returns: [{ name: "full_name", values: ["John Smith"] }, ...]
  const fields = {};
  for (const field of (data.field_data || [])) {
    fields[field.name] = field.values?.[0] || '';
  }

  console.log('[FACEBOOK] Lead fields:', JSON.stringify(fields));

  // Facebook Lead Ads standard field names
  const firstName      = fields['first_name'] || '';
  const lastName       = fields['last_name']  || '';
  const fullName       = fields['full_name']  || `${firstName} ${lastName}`.trim() || 'Unknown';
  const email          = fields['email']       || '';
  const phone          = fields['phone_number'] || fields['phone'] || '';
  const contractorSlug = fields['contractor_slug'] || '';
  const serviceNeeded  = fields['what_service_do_you_need'] || fields['service'] || 'HVAC service';

  if (!phone && !email) {
    console.warn('[FACEBOOK] Lead has no phone or email — skipping:', fields);
    return;
  }

  // ── Step 3: Find contractor by slug ─────────────────────────────────────────
  // Jose sets a hidden field "contractor_slug" in each Lead Ad form with the
  // contractor's booking slug. This tells Tractify exactly where to route the lead.
  if (!contractorSlug) {
    console.warn('[FACEBOOK] No contractor_slug in lead — add a hidden field to your Lead Ad form');
    return;
  }

  const contractor = await db.prepare(`
    SELECT * FROM contractors WHERE booking_slug = $1 AND is_active = 1
  `).get(contractorSlug);

  if (!contractor) {
    console.warn(`[FACEBOOK] No active contractor found for slug: "${contractorSlug}"`);
    return;
  }

  // ── Step 4: Find HVAC niche ─────────────────────────────────────────────────
  const niche = await db.prepare(`SELECT id FROM niches WHERE name = 'HVAC'`).get();
  if (!niche) {
    console.error('[FACEBOOK] HVAC niche not found in DB');
    return;
  }

  // ── Step 5: Create lead in Tractify ─────────────────────────────────────────
  const leadId = uuidv4();
  await db.prepare(`
    INSERT INTO leads
      (id, name, email, phone, niche_id, zip_code, description, status, assigned_contractor_id, source_site)
    VALUES
      ($1, $2, $3, $4, $5, 'facebook', $6, 'matched', $7, 'facebook_lead_ad')
  `).run(
    leadId,
    fullName,
    email || null,
    phone || null,
    niche.id,
    `Facebook Lead Ad — ${serviceNeeded}`,
    contractor.id
  );

  console.log(`[FACEBOOK] Lead created — ${fullName} → contractor ${contractor.name} (lead: ${leadId})`);

  // ── Step 6: Create booking token (48hr expiry) ───────────────────────────────
  const bookingToken = uuidv4();
  const expiresAt    = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await db.prepare(`
    INSERT INTO booking_tokens (id, lead_id, token, expires_at, source)
    VALUES ($1, $2, $3, $4, 'facebook_lead_ad')
  `).run(uuidv4(), leadId, bookingToken, expiresAt);

  const bookingUrl   = `${process.env.FRONTEND_URL || 'https://tractifyhq.com'}/book/${bookingToken}`;
  const businessName = contractor.company_name || contractor.name;
  const firstName_   = fullName.split(' ')[0] || 'there';

  // ── Step 7: Instant SMS — fires within seconds of form submission ─────────────
  // This is the core advantage: homeowner is still on their phone, intent is
  // still hot, no other contractor has reached them yet.
  let smsSent = false;
  if (
    phone &&
    contractor.twilio_number &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN
  ) {
    try {
      const twilio = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      await twilio.messages.create({
        to:   phone,
        from: contractor.twilio_number,
        body: `Hey ${firstName_}! This is ${businessName} — thanks for reaching out. Book a time that works here: ${bookingUrl} — takes 60 seconds and we'll confirm right away.`,
      });
      smsSent = true;
      console.log(`[FACEBOOK] Instant SMS sent to ${phone} (lead ${leadId})`);
    } catch (err) {
      console.error('[FACEBOOK] SMS failed — falling back to email:', err.message);
    }
  }

  // ── Step 8: Email booking link (belt + suspenders) ──────────────────────────
  // Always send the email too — homeowners check both.
  // If SMS already sent, this is a backup. If no Twilio number, this is primary.
  if (email) {
    try {
      const notifications = require('../services/notifications');
      await notifications.sendBookingLink(
        { id: leadId, name: fullName, email, phone },
        contractor,
        bookingUrl
      );
      console.log(`[FACEBOOK] Booking link email sent to ${email} (lead ${leadId})`);
    } catch (err) {
      console.error('[FACEBOOK] Email failed:', err.message);
    }
  }

  if (!smsSent && !email) {
    console.warn(`[FACEBOOK] Lead ${leadId} has no phone or email — no notification sent`);
  }
}

module.exports = router;
