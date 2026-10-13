/**
 * stripe.js — STEP 3 billing (built October 7, 2026, session 41).
 *
 * Flow: contractor replies YES to the trial offer text → twilio.js calls
 * sendPaymentLink() → a hosted Stripe Checkout Session is created (activation
 * fee as a one-time line item + the monthly retainer as a recurring line item,
 * both charged immediately per Jose's call) → the link is texted back →
 * Stripe fires checkout.session.completed to POST /api/stripe/webhook →
 * handleWebhookEvent() marks the contractor paid, locks their Twilio number
 * in permanently (markPoolNumberConverted), texts a confirmation, and emails
 * Jose. No card data ever touches this server — Checkout is fully hosted.
 *
 * Env vars (set in Railway by Jose — never stored in code):
 *   STRIPE_SECRET_KEY      sk_test_... first, sk_live_... at go-live
 *   STRIPE_WEBHOOK_SECRET  whsec_... from the webhook endpoint in Stripe
 */

const db = require('../database/db');
const { BUCKET_PRICING } = require('./pricingBuckets');

let _client = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_client) {
    const Stripe = require('stripe');
    _client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _client;
}

function appUrl() {
  return (process.env.FRONTEND_URL || 'https://tractifyhq.com').replace(/\/$/, '');
}

/** Create a Checkout Session for a contractor's bucket. Returns the session. */
async function createCheckoutSession(contractor) {
  const stripe = getStripe();
  if (!stripe) throw new Error('STRIPE_SECRET_KEY not set');

  const pricing = BUCKET_PRICING[String(contractor.pricing_bucket)];
  if (!pricing) throw new Error(`No pricing bucket for contractor ${contractor.id}`);

  const business = contractor.company_name || contractor.name || 'Tractify';
  const meta = { contractor_id: contractor.id, pricing_bucket: String(contractor.pricing_bucket) };

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    client_reference_id: contractor.id,
    metadata: meta,
    subscription_data: { metadata: meta },
    // Stripe Managed Payments (Stripe as merchant of record) is on by default
    // for new accounts and demands a product tax code on every line item. We bill
    // contractors directly as the seller, so it stays off.
    managed_payments: { enabled: false },
    line_items: [
      {
        // One-time activation fee — in subscription mode a non-recurring line
        // item is charged once alongside the first invoice.
        price_data: {
          currency: 'usd',
          unit_amount: pricing.activation * 100,
          product_data: { name: `Tractify activation — ${business}` },
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: 'usd',
          unit_amount: pricing.retainer * 100,
          recurring: { interval: 'month' },
          product_data: { name: 'Tractify monthly' },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl()}/api/stripe/success`,
    cancel_url: `${appUrl()}/api/stripe/cancelled`,
  });
}

/**
 * Called when a contractor replies YES to the trial offer. Creates the link
 * and texts it. Returns { ok:true } or { ok:false, reason }. Never throws —
 * the caller falls back to alerting Jose on any failure.
 */
async function sendPaymentLink(contractor, twilioClient) {
  const { sendStripeAlertToJose } = require('./notifications');
  const { appendDeterministicSmsTurn } = require('./smsAI');

  if (!getStripe()) {
    await sendStripeAlertToJose({ kind: 'stripe_not_configured', contractor, detail: 'STRIPE_SECRET_KEY is not set in Railway.' }).catch(() => {});
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const session = await createCheckoutSession(contractor);
    const body = `Great — here's your secure payment link: ${session.url}\n\nOnce it goes through, you'll get a confirmation text right here and your number and bookings keep running as they are. Reply here if you have any questions.`;

    await twilioClient.messages.create({ to: contractor.phone, from: contractor.twilio_number, body });
    await appendDeterministicSmsTurn(contractor.id, body, '(system: Stripe payment link sent after contractor replied YES to trial offer)');
    await db.query(`UPDATE contractors SET stripe_checkout_sent_at = NOW() WHERE id = $1`, [contractor.id]);

    await sendStripeAlertToJose({ kind: 'link_sent', contractor, detail: `Bucket ${contractor.pricing_bucket}` }).catch(() => {});
    console.log(`[STRIPE] Payment link sent — ${contractor.name} (${contractor.id})`);
    return { ok: true };
  } catch (err) {
    console.error('[STRIPE] sendPaymentLink failed:', err.message);
    await sendStripeAlertToJose({ kind: 'link_failed', contractor, detail: err.message }).catch(() => {});
    return { ok: false, reason: 'error', error: err.message };
  }
}

/**
 * Paid contractor asks to cancel / change their card → text them a Stripe
 * hosted billing-portal link (they cancel themselves there; the existing
 * customer.subscription.deleted webhook then marks them churned + starts the
 * 6-month number hold). Requires the Customer Portal to be configured once in
 * Stripe (Settings → Billing → Customer portal). Never throws; on failure it
 * alerts Jose and tells the contractor honestly that the team will handle it.
 */
async function sendBillingPortalLink(contractor, twilioClient, { undo = false } = {}) {
  const { sendStripeAlertToJose } = require('./notifications');
  const { appendDeterministicSmsTurn } = require('./smsAI');
  const stripe = getStripe();

  try {
    if (!stripe) throw new Error('STRIPE_SECRET_KEY not set');
    if (!contractor.stripe_customer_id) throw new Error('No stripe_customer_id on this contractor');

    const portal = await stripe.billingPortal.sessions.create({
      customer: contractor.stripe_customer_id,
      return_url: `${appUrl()}/api/stripe/success`,
    });
    const body = undo
      ? `Happy to keep you going. Open your secure billing link and tap "Renew subscription": ${portal.url}\n\nYour billing stays exactly the same, and nothing about your service changes.`
      : `No problem. Here's your secure billing link where you can cancel or update your card anytime: ${portal.url}\n\nIf you cancel, nothing changes today: everything keeps working through the end of the month you've already paid for, then your number and booking system stop and you won't be charged again. I'll text you the exact date once it's confirmed. If you'd rather talk it through first, just reply here.`;
    await twilioClient.messages.create({ to: contractor.phone, from: contractor.twilio_number, body });
    await appendDeterministicSmsTurn(contractor.id, body, '(system: contractor asked to cancel — Stripe billing portal link sent)');
    if (!undo) await sendStripeAlertToJose({ kind: 'cancel_requested', contractor, detail: 'Billing portal link texted. If they cancel, the subscription.deleted webhook will alert you.' }).catch(() => {});
    console.log(`[STRIPE] Billing portal link sent — ${contractor.name} (${contractor.id})`);
    return { ok: true };
  } catch (err) {
    console.error('[STRIPE] sendBillingPortalLink failed:', err.message);
    await sendStripeAlertToJose({ kind: 'portal_failed', contractor, detail: err.message }).catch(() => {});
    return { ok: false, error: err.message };
  }
}

// How to turn call forwarding back off — included in every cancellation text.
// Without this, a cancelled contractor's unanswered calls would keep forwarding
// to a Tractify number that no longer answers them (dead air for their customers).
const FORWARDING_OFF_TEXT = `To turn off call forwarding so unanswered calls go back to your normal voicemail: dial ##61# (AT&T or T-Mobile) or *73 (Verizon), then press call. Not sure which applies to you? Reply here and I'll walk you through it.`;

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Send a deterministic SMS to a contractor and keep sms_conversation in sync. */
async function textContractor(contractor, body, note) {
  if (!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && contractor.twilio_number && contractor.phone)) return;
  const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await twilioClient.messages.create({ to: contractor.phone, from: contractor.twilio_number, body });
  await require('./smsAI').appendDeterministicSmsTurn(contractor.id, body, note);
}

/** Atomic de-dupe on Stripe event id (Stripe retries). Reuses twilio_webhook_events. */
async function claimEvent(eventId) {
  try {
    const { rowCount } = await db.query(
      `INSERT INTO twilio_webhook_events (sid) VALUES ($1) ON CONFLICT (sid) DO NOTHING`,
      [`stripe:${eventId}`]
    );
    return rowCount > 0;
  } catch (e) {
    console.error('[STRIPE] claimEvent failed (failing open):', e.message);
    return true;
  }
}

async function loadContractor(id) {
  const { rows } = await db.query(`SELECT * FROM contractors WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** Process one verified Stripe event. */
async function handleWebhookEvent(event) {
  const { sendStripeAlertToJose } = require('./notifications');

  if (!(await claimEvent(event.id))) {
    console.log(`[STRIPE] Duplicate event ignored: ${event.id}`);
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      const contractorId = s.client_reference_id || s.metadata?.contractor_id;
      if (!contractorId) { console.warn('[STRIPE] checkout.session.completed with no contractor id'); return; }
      if (s.payment_status && s.payment_status !== 'paid') {
        console.warn(`[STRIPE] Session ${s.id} completed but payment_status=${s.payment_status} — ignoring`);
        return;
      }

      await db.query(
        `UPDATE contractors
            SET payment_status = 'paid', stripe_customer_id = $1, stripe_subscription_id = $2, paid_at = NOW()
          WHERE id = $3`,
        [s.customer || null, s.subscription || null, contractorId]
      );

      try { await require('./twilioPool').markPoolNumberConverted(contractorId); }
      catch (e) { console.error('[STRIPE] markPoolNumberConverted failed:', e.message); }

      const contractor = await loadContractor(contractorId);
      if (contractor) {
        try {
          if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && contractor.twilio_number && contractor.phone) {
            const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const body = `Payment received — thank you! You're all set. Your number and bookings keep running exactly as they are. Text me anytime if you need anything.`;
            await twilioClient.messages.create({ to: contractor.phone, from: contractor.twilio_number, body });
            await require('./smsAI').appendDeterministicSmsTurn(contractor.id, body, '(system: payment received, contractor converted to paid)');
          }
        } catch (e) { console.error('[STRIPE] Confirmation SMS failed:', e.message); }

        const amt = typeof s.amount_total === 'number' ? `$${(s.amount_total / 100).toFixed(2)}` : '';
        await sendStripeAlertToJose({ kind: 'paid', contractor, detail: `${amt} collected (activation + first month)`.trim() }).catch(() => {});
      }
      console.log(`[STRIPE] Contractor ${contractorId} marked paid`);
      return;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object;
      const contractorId = inv.subscription_details?.metadata?.contractor_id || inv.metadata?.contractor_id;
      const contractor = contractorId ? await loadContractor(contractorId) : null;
      if (contractor) {
        await sendStripeAlertToJose({ kind: 'payment_failed', contractor, detail: `Invoice ${inv.id}, attempt ${inv.attempt_count || '?'}` }).catch(() => {});
      } else {
        console.warn(`[STRIPE] invoice.payment_failed for unknown contractor (invoice ${inv.id})`);
      }
      return;
    }

    // Fires when a contractor cancels (or un-cancels) in the billing portal with
    // "cancel at end of billing period": record the last paid day and confirm by
    // text. Must be enabled on the Stripe webhook destination.
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const contractorId = sub.metadata?.contractor_id;
      if (!contractorId) return;
      const contractor = await loadContractor(contractorId);
      if (!contractor) return;

      const cancelling = !!(sub.cancel_at_period_end || sub.cancel_at);
      const endUnix = sub.cancel_at || sub.items?.data?.[0]?.current_period_end || sub.current_period_end;

      if (cancelling && endUnix) {
        const endDate = new Date(endUnix * 1000);
        const already = contractor.paid_through && Math.abs(new Date(contractor.paid_through) - endDate) < 60000;
        if (already) return; // no change — don't re-text
        await db.query(`UPDATE contractors SET paid_through = $1 WHERE id = $2`, [endDate.toISOString(), contractorId]);
        const when = fmtDate(endDate);
        try {
          await textContractor(contractor,
            `Your cancellation is confirmed. Everything keeps working until ${when}, the end of the period you've paid for, and you won't be charged again. After that your number and booking system stop. I'll text you that day with how to turn off call forwarding.\n\nChanged your mind? Before ${when}, just text me "keep my subscription" and I'll send you the link to undo it. Your billing stays exactly the same.`,
            '(system: cancellation confirmed, last day + forwarding-off instructions sent)');
        } catch (e) { console.error('[STRIPE] Cancellation confirmation SMS failed:', e.message); }
        await sendStripeAlertToJose({ kind: 'cancel_scheduled', contractor, detail: `Last day of service: ${when}` }).catch(() => {});
      } else if (!cancelling && contractor.paid_through) {
        await db.query(`UPDATE contractors SET paid_through = NULL WHERE id = $1`, [contractorId]);
        try {
          await textContractor(contractor, `Welcome back — your cancellation has been undone and everything keeps running as normal.`, '(system: cancellation undone)');
        } catch (e) { console.error('[STRIPE] Un-cancel SMS failed:', e.message); }
        await sendStripeAlertToJose({ kind: 'cancel_undone', contractor, detail: 'Contractor reversed their cancellation.' }).catch(() => {});
      }
      return;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const contractorId = sub.metadata?.contractor_id;
      if (!contractorId) return;
      await db.query(
        `UPDATE contractors SET payment_status = 'churned', twilio_hold_until = NOW() + INTERVAL '6 months' WHERE id = $1`,
        [contractorId]
      );
      const contractor = await loadContractor(contractorId);
      if (contractor) {
        try {
          await textContractor(contractor,
            `Your Tractify subscription has now ended, so your number and booking system are off. Thanks for giving us a shot.\n\n${FORWARDING_OFF_TEXT}\n\nWant back in? Email support@tractifyhq.com and we'll get you set up (your number is held for 6 months).`,
            '(system: subscription ended, forwarding-off instructions sent)');
        } catch (e) { console.error('[STRIPE] Subscription-ended SMS failed:', e.message); }
        await sendStripeAlertToJose({
          kind: 'subscription_ended', contractor,
          detail: 'Marked churned with a 6-month number hold. Deactivate the contractor manually if appropriate (is_active is NOT changed automatically).',
        }).catch(() => {});
      }
      return;
    }

    default:
      return; // other event types are intentionally ignored
  }
}

module.exports = { getStripe, createCheckoutSession, sendPaymentLink, sendBillingPortalLink, handleWebhookEvent };
