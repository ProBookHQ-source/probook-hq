const express       = require('express');
const twilio        = require('twilio');
const db            = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

const router  = express.Router();

// ── POST /api/twilio/missed-call ──────────────────────────────────────────────
// Twilio webhook — fires when a call comes in to a contractor's Twilio number.
//
// Setup: contractor forwards their business line to their Twilio number.
// Every call that reaches Twilio here is a missed call — we play a voice
// message, send the caller an SMS with a booking link, and hang up.
//
// Twilio sends: To (Twilio number), From (caller's number), CallStatus, etc.
router.post('/missed-call', async (req, res) => {
  const { To, From, CallStatus } = req.body;

  console.log(`[TWILIO] Incoming — To: ${To}, From: ${From}, Status: ${CallStatus}`);

  // ── Signature validation — prevents spoofed webhook requests ────────────────
  if (process.env.TWILIO_AUTH_TOKEN) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const signature = req.headers['x-twilio-signature'];
    const url       = `${process.env.FRONTEND_URL}/api/twilio/missed-call`;
    const isValid   = twilio.validateRequest(authToken, signature, url, req.body);
    if (!isValid) {
      console.warn('[TWILIO] Invalid signature — possible spoofed request, ignoring');
      // Still return valid TwiML so Twilio doesn't keep retrying
      res.type('text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    }
  }

  // ── Look up contractor by their Twilio number ────────────────────────────────
  const contractor = await db.prepare(`
    SELECT id, company_name, name, booking_slug
    FROM contractors
    WHERE twilio_number = ? AND is_active = 1
  `).get(To);

  if (!contractor) {
    console.warn(`[TWILIO] No active contractor found for Twilio number: ${To}`);
    res.type('text/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  // Stamp test call timestamp — used by the portal's live call-forwarding test
  db.query(`UPDATE contractors SET twilio_test_call_at = NOW() WHERE id = $1`, [contractor.id])
    .catch(e => console.warn('[TWILIO] Failed to stamp test call timestamp:', e.message));

  const businessName = contractor.company_name || contractor.name || 'us';
  const bookingSlug  = contractor.booking_slug;
  // ?src=missed_call tags this booking so the AI brain knows which channel drove it
  const bookingLink  = bookingSlug
    ? `${process.env.FRONTEND_URL}/schedule/${bookingSlug}?src=missed_call`
    : process.env.FRONTEND_URL;

  // ── Start homeowner SMS session (Brain 3) — or fall back to booking link ─────
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && From) {
    try {
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      let smsBody;
      try {
        // Brain 3: start a conversational booking session
        const { startHomeownerSession, getLastConfirmedBooking } = require('../services/homeownerSmsAI');
        const result = await startHomeownerSession(From, contractor.id);
        const isReturning = result && result.isReturning;

        if (isReturning && result.name) {
          const firstName = result.name.split(' ')[0];
          smsBody = `Hey ${firstName}! Great to hear from you again — what's going on this time? Reply STOP to opt out.`;
        } else {
          smsBody = `Hey! Sorry we missed you at ${businessName} — we're out on a job. I'm their scheduling assistant. What's the address that needs service? Reply STOP to opt out.`;
        }
        console.log(`[TWILIO] Brain 3 session started for ${From} → contractor ${contractor.id} (returning: ${isReturning})`);
      } catch (brainErr) {
        console.error(`[TWILIO] Brain 3 session failed, falling back to booking link:`, brainErr.message);
        smsBody = `Hey! This is ${businessName} — sorry we missed your call, we're out on a job. Book a time that works for you here: ${bookingLink} — takes 60 seconds and we'll confirm right away. Reply STOP to opt out.`;
      }

      await client.messages.create({ to: From, from: To, body: smsBody });
      console.log(`[TWILIO] SMS sent to ${From} for contractor ${contractor.id} (${businessName})`);
    } catch (err) {
      console.error(`[TWILIO] SMS send failed:`, err.message);
    }
  }

  // ── Return TwiML: play voice message then hang up ────────────────────────────
  // Escape any special XML characters in business name just in case
  const safeName = businessName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thanks for calling ${safeName}. We're out on a job right now but we just texted you a link to book a time that works for you. Check your messages!</Say>
  <Hangup/>
</Response>`);
});

// ── POST /api/twilio/inbound-sms ─────────────────────────────────────────────
// Twilio webhook — fires when someone TEXTS the contractor's Twilio number.
//
// Routing logic:
//   1. If the sender's phone matches the contractor's own registered phone → they're
//      the contractor. Route to AI assistant (smsAI.js) for full two-way chat.
//   2. Otherwise → homeowner. Send them the booking link (same as missed-call flow).
//
// Twilio console setup: set "A message comes in" webhook on the Twilio number to
//   https://tractifyhq.com/api/twilio/inbound-sms
// (separate from the voice webhook on the same number at /api/twilio/missed-call)
router.post('/inbound-sms', async (req, res) => {
  const { To, From, Body } = req.body;

  console.log(`[TWILIO-SMS] Incoming — To: ${To}, From: ${From}, Body: ${Body?.substring(0, 60)}`);

  // ── Signature validation ─────────────────────────────────────────────────────
  if (process.env.TWILIO_AUTH_TOKEN) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const signature = req.headers['x-twilio-signature'];
    const url       = `${process.env.FRONTEND_URL}/api/twilio/inbound-sms`;
    const isValid   = twilio.validateRequest(authToken, signature, url, req.body);
    if (!isValid) {
      console.warn('[TWILIO-SMS] Invalid signature — ignoring');
      res.type('text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
    }
  }

  // ── Look up contractor by Twilio number ──────────────────────────────────────
  const contractor = await db.prepare(`
    SELECT id, name, company_name, phone, booking_slug, twilio_number,
           onboarding_steps, sms_conversation, sms_welcome_sent,
           sms_power_message_sent, sms_calendar_training_sent, business_phone
    FROM contractors
    WHERE twilio_number = ? AND is_active = 1
  `).get(To);

  if (!contractor) {
    console.warn(`[TWILIO-SMS] No active contractor for number: ${To}`);
    res.type('text/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
  }

  // ── Phone number normalization (last 10 digits) ──────────────────────────────
  const normalize = (num) => (num || '').replace(/\D/g, '').slice(-10);
  const fromDigits = normalize(From);
  const contractorDigits = normalize(contractor.phone);
  const isContractor = contractorDigits && contractorDigits === fromDigits;

  const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

  if (!twilioClient) {
    console.warn('[TWILIO-SMS] No Twilio credentials — cannot send reply');
    res.type('text/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
  }

  if (isContractor) {
    // ── Contractor texting in → AI assistant ──────────────────────────────────
    console.log(`[TWILIO-SMS] Contractor recognized — routing to AI assistant`);
    try {
      const { handleContractorSms } = require('../services/smsAI');
      const reply = await handleContractorSms(contractor, Body || '');
      await twilioClient.messages.create({ to: From, from: To, body: reply });
      console.log(`[TWILIO-SMS] AI reply sent to contractor ${contractor.name}: ${reply.substring(0, 80)}`);
    } catch (err) {
      console.error('[TWILIO-SMS] AI handler error:', err.message);
      await twilioClient.messages.create({
        to: From, from: To,
        body: `Got your message. Log in at tractifyhq.com/contractor for full access.`,
      }).catch(() => {});
    }
  } else {
    // ── Homeowner texting in → Brain 3 (conversational booking) ───────────────
    const businessName = contractor.company_name || contractor.name || 'us';
    let replyBody = null;

    // ── CANCEL keyword — cancel today's appointment and rebook via Brain 3 ─────
    if ((Body || '').trim().toUpperCase() === 'CANCEL') {
      try {
        // Find a confirmed appointment for this homeowner + contractor (next 7 days)
        const { rows: appts } = await db.query(`
          SELECT a.id, a.scheduled_date, a.scheduled_time,
                 l.id AS lead_id, l.name AS lead_name, l.phone AS lead_phone, l.address AS lead_address
          FROM appointments a
          JOIN leads l ON a.lead_id = l.id
          WHERE a.contractor_id = $1
            AND a.status = 'confirmed'
            AND a.scheduled_date >= CURRENT_DATE
            AND a.scheduled_date <= CURRENT_DATE + INTERVAL '7 days'
            AND REPLACE(REPLACE(REPLACE(l.phone, '-', ''), ' ', ''), '+1', '') = RIGHT(REPLACE($2, '+', ''), 10)
          ORDER BY a.scheduled_date, a.scheduled_time
          LIMIT 1
        `, [contractor.id, From]);

        if (appts.length) {
          const appt = appts[0];
          await db.prepare("UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1").run(appt.id);
          await db.prepare("UPDATE leads SET status = 'matched' WHERE id = $1").run(appt.lead_id);
          const { logEvent } = require('../services/auditLog');
          logEvent(appt.lead_id, 'cancelled', 'homeowner', 'Cancelled via CANCEL SMS keyword').catch(() => {});

          // Start Brain 3 rebook session
          const { startRebookSession } = require('../services/homeownerSmsAI');
          const lead = { id: appt.lead_id, name: appt.lead_name, phone: appt.lead_phone, address: appt.lead_address };
          const slotsText = await startRebookSession(From, contractor.id, lead);

          const firstName = appt.lead_name ? appt.lead_name.split(' ')[0] : null;
          const greeting  = firstName ? `Got it ${firstName} — ` : 'Got it — ';
          replyBody = slotsText
            ? `${greeting}appointment cancelled. ${slotsText}`
            : `${greeting}appointment cancelled. Reply any time to rebook.`;
        } else {
          replyBody = `No upcoming appointment found for this number. Want to book one? Just reply and I'll help.`;
        }
      } catch (cancelErr) {
        console.error('[TWILIO-SMS] CANCEL keyword error:', cancelErr.message);
        replyBody = `Couldn't find your appointment. Call us or reply to rebook.`;
      }

      try {
        await twilioClient.messages.create({ to: From, from: To, body: replyBody });
      } catch (err) {
        console.error('[TWILIO-SMS] CANCEL reply send error:', err.message);
      }
      res.type('text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
    }

    try {
      const { getActiveSession, routeHomeownerSms, startHomeownerSession } = require('../services/homeownerSmsAI');

      // Check for active session first
      const activeSession = await getActiveSession(From, contractor.id);

      if (activeSession) {
        // Continue existing conversation
        console.log(`[TWILIO-SMS] Homeowner ${From} has active Brain 3 session (state: ${activeSession.state}) — routing`);
        replyBody = await routeHomeownerSms(From, contractor.id, Body || '');
      } else {
        // No session — unsolicited text (van wrap, SMS keyword, etc.)
        // Start a fresh session and greet appropriately
        console.log(`[TWILIO-SMS] Homeowner (${From}) — no session, starting Brain 3 (sms_keyword)`);
        const result = await startHomeownerSession(From, contractor.id);
        const isReturning = result && result.isReturning;

        if (isReturning && result.name) {
          const firstName = result.name.split(' ')[0];
          replyBody = `Hey ${firstName}! Great to hear from you again — what's going on this time? Reply STOP to opt out.`;
        } else {
          replyBody = `Hey! This is ${businessName}. Happy to help — what's the address that needs service? Reply STOP to opt out.`;
        }
      }
    } catch (brainErr) {
      console.error('[TWILIO-SMS] Brain 3 error, falling back to booking link:', brainErr.message);
    }

    // Fallback if Brain 3 failed or returned null
    if (!replyBody) {
      const bookingLink = contractor.booking_slug
        ? `${process.env.FRONTEND_URL}/schedule/${contractor.booking_slug}?src=sms_keyword`
        : process.env.FRONTEND_URL;
      replyBody = `Hey! This is ${businessName}. Book a time online here: ${bookingLink} — takes 60 seconds and we'll confirm right away. Reply STOP to opt out.`;
    }

    try {
      await twilioClient.messages.create({ to: From, from: To, body: replyBody });
      console.log(`[TWILIO-SMS] Brain 3 reply sent to homeowner ${From}: ${replyBody.substring(0, 80)}`);
    } catch (err) {
      console.error('[TWILIO-SMS] Failed to send homeowner reply:', err.message);
    }
  }

  // Always return empty TwiML — we already sent via REST API above
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
});

// ── POST /api/twilio/test-sms ─────────────────────────────────────────────────
// Admin-only: simulate an inbound SMS conversation for testing Brain 2 (contractor)
// and Brain 3 (homeowner) without needing real Twilio credentials or a deployed number.
//
// Runs the exact same routing logic as /inbound-sms but accepts contractorId directly
// instead of a Twilio "To" number, and skips signature validation. Returns the AI
// reply as JSON instead of sending a real SMS — perfect for Postman/curl testing
// while Twilio compliance is pending.
//
// Body:
//   {
//     phone:        string  — simulated sender phone, e.g. "+12065551234" (optional, defaults to test number)
//     message:      string  — the SMS text to send (required)
//     role:         string  — "contractor" | "homeowner" (required)
//     contractorId: string  — UUID of the target contractor (required)
//   }
//
// Returns:
//   { role, contractor, phone, message, reply, sessionState?, sessionId? }
//
// Example curl:
//   curl -X POST https://tractifyhq.com/api/twilio/test-sms \
//     -H "Authorization: Bearer ADMIN_JWT" \
//     -H "Content-Type: application/json" \
//     -d '{"phone":"+12065551234","message":"what is on my calendar tomorrow","role":"contractor","contractorId":"UUID"}'
router.post('/test-sms', requireAdmin, async (req, res) => {
  const { phone, message, role, contractorId } = req.body;

  if (!message || !role || !contractorId) {
    return res.status(400).json({ error: 'message, role, and contractorId are required' });
  }
  if (role !== 'contractor' && role !== 'homeowner') {
    return res.status(400).json({ error: 'role must be "contractor" or "homeowner"' });
  }

  // Normalize phone — default to a test number if omitted
  const rawPhone        = (phone || '+10000000000').replace(/\s/g, '');
  const digits          = rawPhone.replace(/\D/g, '');
  const normalizedPhone = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  // Look up contractor by ID
  const { rows } = await db.query(`
    SELECT id, name, company_name, phone, booking_slug, twilio_number,
           onboarding_steps, sms_conversation, sms_welcome_sent,
           sms_power_message_sent, sms_calendar_training_sent, business_phone
    FROM contractors
    WHERE id = $1 AND is_active = 1
  `, [contractorId]);

  if (!rows.length) {
    return res.status(404).json({ error: `No active contractor found with id: ${contractorId}` });
  }

  const contractor  = rows[0];
  const businessName = contractor.company_name || contractor.name || 'us';

  console.log(`[TEST-SMS] role=${role} phone=${normalizedPhone} contractor="${businessName}" message="${message.substring(0, 60)}"`);

  // ── Contractor role → Brain 2 (smsAI.js) ────────────────────────────────────
  if (role === 'contractor') {
    const { handleContractorSms } = require('../services/smsAI');
    const reply = await handleContractorSms(contractor, message);
    console.log(`[TEST-SMS] Brain 2 reply: "${reply.substring(0, 80)}"`);
    return res.json({ role, contractor: businessName, phone: normalizedPhone, message, reply });
  }

  // ── Homeowner role → Brain 3 (homeownerSmsAI.js) ────────────────────────────
  const { getActiveSession, routeHomeownerSms, startHomeownerSession } = require('../services/homeownerSmsAI');

  // CANCEL keyword — explain what would happen without touching real data
  if (message.trim().toUpperCase() === 'CANCEL') {
    const activeSession = await getActiveSession(normalizedPhone, contractorId);
    return res.json({
      role,
      contractor: businessName,
      phone: normalizedPhone,
      message,
      reply: '[CANCEL keyword — in production this finds the next confirmed appointment for this phone + contractor, cancels it, and starts a Brain 3 rebook session with available slots. No data was changed in this test.]',
      sessionState: activeSession?.state || null,
      note: 'To test the full CANCEL flow, use the live /inbound-sms webhook with a real phone that has a confirmed appointment.',
    });
  }

  let reply;

  // Check for an existing Brain 3 session with this phone + contractor
  const activeSession = await getActiveSession(normalizedPhone, contractorId);

  if (activeSession) {
    // Continue existing conversation
    console.log(`[TEST-SMS] Active Brain 3 session (state: ${activeSession.state}) — routing`);
    reply = await routeHomeownerSms(normalizedPhone, contractorId, message);
  } else {
    // No session → unsolicited text (van wrap / SMS keyword / fridge magnet flow)
    console.log(`[TEST-SMS] No active session — starting new Brain 3 session`);
    const result      = await startHomeownerSession(normalizedPhone, contractorId);
    const isReturning = result && result.isReturning;

    if (isReturning && result.name) {
      const firstName = result.name.split(' ')[0];
      reply = `Hey ${firstName}! Great to hear from you again — what's going on this time?`;
    } else {
      reply = `Hey! This is ${businessName}. Happy to help — what's the address that needs service?`;
    }
  }

  // Safety net in case Brain 3 returned null
  if (!reply) {
    reply = `Hey! This is ${businessName}. Happy to help — what's the address that needs service?`;
  }

  console.log(`[TEST-SMS] Brain 3 reply: "${reply.substring(0, 80)}"`);

  // Fetch updated session state for debugging
  const updatedSession = await getActiveSession(normalizedPhone, contractorId);

  return res.json({
    role,
    contractor: businessName,
    phone: normalizedPhone,
    message,
    reply,
    sessionState: updatedSession?.state || null,
    sessionId:    updatedSession?.id    || null,
  });
});

module.exports = router;
