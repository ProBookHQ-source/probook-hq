/**
 * Cloudflare Worker — probook-upload
 * Handles intake form submissions: R2 storage + Resend email + Tractify auto-deploy
 *
 * HOW TO DEPLOY:
 *   cd ~/Desktop/probook-upload-worker
 *   # Copy this file to src/index.js (replace the existing one)
 *   cp ~/Desktop/lead-booking-app/NewWorkerScript-auto-deploy.js src/index.js
 *   npx wrangler deploy
 *
 * WORKER SECRETS NEEDED (run once in terminal):
 *   npx wrangler secret put TRACTIFY_DEPLOY_KEY
 *   → paste the value of DEPLOY_SECRET from Railway env vars
 *
 * Existing secrets (already set):
 *   ANTHROPIC_API_KEY  — Claude headline generation (currently unused)
 *   RESEND_API_KEY     — email notifications
 *
 * Environment bindings (in wrangler.toml, already set):
 *   ASSETS  — R2 bucket (probook-assets)
 */

const TRACTIFY_API = 'https://tractifyhq.com';

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      return corsResp(null, 204);
    }

    // ── Routes ──────────────────────────────────────────────────────────────
    if (path === '/' && method === 'POST')         return handleUpload(request, env);
    if (path === '/headline' && method === 'POST') return handleHeadline(request, env);
    if (path === '/submit' && method === 'POST')   return handleSubmit(request, env);

    return new Response('Not found', { status: 404 });
  }
};

// ── POST / — R2 file upload ──────────────────────────────────────────────────
async function handleUpload(request, env) {
  try {
    const form     = await request.formData();
    const file     = form.get('file');
    const clientId = form.get('client_id') || 'unknown';
    const slot     = form.get('slot')      || 'default';

    if (!file) return corsResp({ error: 'No file provided' }, 400);

    const ext = file.name?.split('.').pop() || 'bin';
    const key = `clients/${clientId}/${slot}.${ext}`;

    await env.ASSETS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    const url = `https://pub-cb776419b2d3427d8f026331946d0f8f.r2.dev/${key}`;
    return corsResp({ ok: true, url, key });
  } catch (e) {
    return corsResp({ error: e.message }, 500);
  }
}

// ── POST /headline — AI hero headline (unused since branding step removed) ───
async function handleHeadline(request, env) {
  return corsResp({ headline: 'Comfort You Can Count On.' });
}

// ── POST /submit — Main intake form submission ────────────────────────────────
async function handleSubmit(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return corsResp({ error: 'Invalid JSON' }, 400);
  }

  const clientId = payload.clientId || `sub_${Date.now()}`;

  // ── 1. Save to R2 ─────────────────────────────────────────────────────────
  try {
    const key  = `submissions/${clientId}/submission.json`;
    await env.ASSETS.put(key, JSON.stringify(payload, null, 2), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (r2Err) {
    console.error('[WORKER] R2 save failed:', r2Err.message);
    // Non-fatal — continue to email and deploy
  }

  // ── 2. Send email notification to Jose ───────────────────────────────────
  const emailPromise = (async () => {
    if (!env.RESEND_API_KEY) return;
    const emailBody = JSON.stringify({
      from:    'Tractify <bookings@tractifyhq.com>',
      to:      ['bookings@tractifyhq.com'],
      subject: `New intake submission: ${payload.businessName || 'Unknown'}`,
      html: `
        <h2>New Tractify Intake Submission</h2>
        <p><strong>Business:</strong> ${esc(payload.businessName)}</p>
        <p><strong>Contact:</strong> ${esc(payload.contactName)} — ${esc(payload.contactEmail)}</p>
        <p><strong>Phone:</strong> ${esc(payload.phone)}</p>
        <p><strong>City:</strong> ${esc(payload.city)}</p>
        <p><strong>ZIP codes:</strong> ${(payload.zips || []).join(', ')}</p>
        <p><strong>Services:</strong> ${(payload.services || []).join(', ')}</p>
        <p><strong>Google rating:</strong> ${esc(payload.reviewScore)} (${esc(payload.reviewCount)} reviews)</p>
        <p><strong>Years in business:</strong> ${esc(payload.years)}</p>
        <p><strong>Google URL:</strong> ${esc(payload.googleUrl)}</p>
        <hr>
        <p><em>Auto-deploy is in progress — contractor will receive their portal login email shortly.</em></p>
      `,
    });
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: emailBody,
    });
  })();

  // ── 3. Trigger Tractify auto-deploy ──────────────────────────────────────
  // Fire-and-forget — don't block the response waiting for deploy to finish.
  // Tractify handles the full deploy pipeline: contractor account, API key,
  // Cloudflare Pages, CNAME, availability slots, welcome email.
  const deployPromise = (async () => {
    if (!env.TRACTIFY_DEPLOY_KEY) {
      console.warn('[WORKER] TRACTIFY_DEPLOY_KEY not set — skipping auto-deploy');
      return;
    }
    try {
      const resp = await fetch(`${TRACTIFY_API}/api/deploy`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${env.TRACTIFY_DEPLOY_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await resp.json().catch(() => ({}));
      if (resp.ok) {
        console.log(`[WORKER] Auto-deploy success: ${result.siteUrl}`);
      } else {
        console.error(`[WORKER] Auto-deploy failed ${resp.status}:`, result.error || 'unknown');
      }
    } catch (deployErr) {
      console.error('[WORKER] Auto-deploy fetch error:', deployErr.message);
    }
  })();

  // Wait for email (fast) and let deploy run in background
  await Promise.allSettled([emailPromise, deployPromise]);

  return corsResp({ ok: true, clientId });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function corsResp(body, status = 200) {
  return new Response(
    body === null ? null : JSON.stringify(body),
    {
      status,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  );
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
