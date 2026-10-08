/**
 * routes/stripe.js — Stripe webhook + post-checkout landing pages.
 *
 * IMPORTANT: the webhook route needs the RAW request body for signature
 * verification, so server.js mounts `webhookRouter` BEFORE express.json().
 * `pagesRouter` (success/cancelled pages) is a normal router.
 */
const express = require('express');
const { getStripe, handleWebhookEvent } = require('../services/stripe');

const webhookRouter = express.Router();
webhookRouter.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    console.warn('[STRIPE] Webhook hit but STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET not set');
    return res.status(503).send('Stripe not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.warn('[STRIPE] Webhook signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  try {
    await handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    // 500 makes Stripe retry — the handler is idempotent (event-id claim).
    console.error('[STRIPE] Webhook handler error:', err.message);
    res.status(500).send('Handler error');
  }
});

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,Inter,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{background:#fff;border-radius:16px;padding:40px 32px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}h1{font-size:22px;margin:0 0 12px}p{color:#475569;line-height:1.5;margin:0}</style></head>
<body><div class="c"><h1>${title}</h1><p>${body}</p></div></body></html>`;

const pagesRouter = express.Router();
pagesRouter.get('/success', (req, res) =>
  res.send(page("You're all set", "Payment received. We'll text you a confirmation in a moment. You can close this page.")));
pagesRouter.get('/cancelled', (req, res) =>
  res.send(page('No problem', 'Nothing was charged. Reply YES to the text again whenever you want a fresh payment link.')));

module.exports = { webhookRouter, pagesRouter };
