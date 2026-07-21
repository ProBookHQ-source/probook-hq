const express = require('express');
const twilio  = require('twilio');
const db      = require('../database/db');

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

  const businessName = contractor.company_name || contractor.name || 'us';
  const bookingSlug  = contractor.booking_slug;
  const bookingLink  = bookingSlug
    ? `${process.env.FRONTEND_URL}/schedule/${bookingSlug}`
    : process.env.FRONTEND_URL;

  // ── Send SMS to the caller ───────────────────────────────────────────────────
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && From) {
    try {
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      await client.messages.create({
        to:   From,
        from: To, // reply from the contractor's Twilio number
        body: `Hey! This is ${businessName} — sorry we missed your call, we're out on a job. Book a time that works for you here: ${bookingLink} — takes 60 seconds and we'll confirm right away.`,
      });
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

module.exports = router;
