'use strict';

const crypto = require('crypto');

const CF_API      = 'https://api.cloudflare.com/client/v4';
const ACCOUNT_ID  = () => process.env.CLOUDFLARE_ACCOUNT_ID;
const ZONE_ID     = () => process.env.CLOUDFLARE_ZONE_ID;
const API_TOKEN   = () => process.env.CLOUDFLARE_API_TOKEN;

function jsonHeaders() {
  return {
    Authorization:  `Bearer ${API_TOKEN()}`,
    'Content-Type': 'application/json',
  };
}

// ── Create a new Cloudflare Pages project ─────────────────────────────────────
async function createPagesProject(name) {
  const res  = await fetch(`${CF_API}/accounts/${ACCOUNT_ID()}/pages/projects`, {
    method:  'POST',
    headers: jsonHeaders(),
    body:    JSON.stringify({ name, production_branch: 'main' }),
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`Pages project create failed: ${JSON.stringify(data.errors)}`);
  }
  // Returns the subdomain e.g. "tractify-premiercomfort.pages.dev"
  return data.result;
}

// ── Deploy a single index.html file to an existing Pages project ──────────────
// Uses the Cloudflare Pages Direct Upload API.
// - Raw (uncompressed) HTML bytes — Pages handles storage and serving natively
// - SHA256 hash computed from raw content
// - Content-Type: text/html so Pages knows what it's storing
// - Manifest keys use leading slash (e.g. /index.html)
// NOTE: Do NOT gzip the content here. If we upload gzip bytes without a
// per-part Content-Encoding header (which FormData can't set), Pages stores
// binary and serves it as HTML → HTTP 500.
async function deployToPages(projectName, htmlContent) {
  const rawBuffer = Buffer.from(htmlContent, 'utf-8');
  const hash      = crypto.createHash('sha256').update(rawBuffer).digest('hex');

  const form = new FormData();

  // Manifest: plain string field — must NOT be a Blob or File because undici adds
  // filename="blob" to the Content-Disposition, which makes CF treat it as a file
  // upload instead of a named field and returns error 8000096.
  form.append('manifest', JSON.stringify({ '/index.html': hash }));

  // File: raw HTML bytes, part name = hash, filename = hash
  form.append(
    hash,
    new Blob([rawBuffer], { type: 'text/html; charset=utf-8' }),
    hash
  );

  const res  = await fetch(
    `${CF_API}/accounts/${ACCOUNT_ID()}/pages/projects/${projectName}/deployments`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${API_TOKEN()}` },
      body: form,
    }
  );
  const data = await res.json();
  // Log full response so Railway logs show exactly what CF returns
  console.log(`[CF-DEPLOY] HTTP ${res.status} — ${JSON.stringify(data).slice(0, 800)}`);
  if (!data.success) {
    throw new Error(`Pages deploy failed: ${JSON.stringify(data.errors)}`);
  }
  const deployUrl = data.result?.url || `https://${projectName}.pages.dev`;
  console.log(`[CF] Deployment live: ${deployUrl}`);
  return data.result;
}

// ── Delete stale DNS records for a subdomain (cleanup before custom domain add) ─
// Finds and deletes any existing CNAME records for `subdomain.tractifyhq.com`
// so Pages can create its own record without conflict.
async function deleteDnsRecords(subdomain) {
  const fullName = `${subdomain}.tractifyhq.com`;
  const res = await fetch(
    `${CF_API}/zones/${ZONE_ID()}/dns_records?type=CNAME&name=${encodeURIComponent(fullName)}&per_page=50`,
    { headers: { Authorization: `Bearer ${API_TOKEN()}` } }
  );
  const data = await res.json();
  if (!data.success || !data.result?.length) return;
  for (const record of data.result) {
    await fetch(`${CF_API}/zones/${ZONE_ID()}/dns_records/${record.id}`, {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${API_TOKEN()}` },
    });
    console.log(`[CF] Deleted stale DNS record: ${record.name} → ${record.content}`);
  }
}

// ── Remove a custom domain from a Cloudflare Pages project ───────────────────
async function removePagesDomain(projectName, domain) {
  const res = await fetch(
    `${CF_API}/accounts/${ACCOUNT_ID()}/pages/projects/${projectName}/domains/${encodeURIComponent(domain)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${API_TOKEN()}` } }
  );
  console.log(`[CF] Removed domain ${domain} from ${projectName} (HTTP ${res.status})`);
}

// ── Register a custom domain on a Cloudflare Pages project ───────────────────
// Registers the domain with Pages AND creates the DNS record automatically.
// If already registered AND active — skip entirely (DNS + SSL already working).
// If already registered but NOT active — remove and re-add to recover.
//
// IMPORTANT: Never also call createCname() after this — a proxied CNAME to
// .pages.dev conflicts with Pages' internal routing and causes HTTP 500.
async function addPagesDomain(projectName, domain) {
  // ── Check current status first ────────────────────────────────────────────
  const checkRes = await fetch(
    `${CF_API}/accounts/${ACCOUNT_ID()}/pages/projects/${projectName}/domains/${encodeURIComponent(domain)}`,
    { headers: { Authorization: `Bearer ${API_TOKEN()}` } }
  );
  if (checkRes.ok) {
    const checkData = await checkRes.json();
    if (checkData.success && checkData.result?.status === 'active') {
      console.log(`[CF] Custom domain ${domain} already active — skipping (DNS + SSL intact)`);
      return checkData.result;
    }
    // Registered but not active — remove and re-add below
    if (checkData.success) {
      console.log(`[CF] Domain registered but status=${checkData.result?.status} — removing and re-adding`);
      await removePagesDomain(projectName, domain);
    }
  }

  // ── Try to register ───────────────────────────────────────────────────────
  const res  = await fetch(
    `${CF_API}/accounts/${ACCOUNT_ID()}/pages/projects/${projectName}/domains`,
    { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name: domain }) }
  );
  const data = await res.json();
  if (!data.success) {
    const errMsg = JSON.stringify(data.errors || '');
    const alreadyExists =
      data.errors?.some(e => e.code === 8000007 || e.code === 8000013) ||
      errMsg.toLowerCase().includes('already');

    if (alreadyExists) {
      // Race condition — registered between our check and add; check status again
      console.log(`[CF] Domain registered concurrently — treating as active`);
      return { name: domain };
    }
    throw new Error(`Pages custom domain failed: ${errMsg}`);
  }
  console.log(`[CF] Custom domain registered: ${domain} → ${projectName}`);
  return data.result;
}

// ── Create a CNAME record (kept for reference / manual use) ──────────────────
// NOTE: For Pages subdomain routing, use addPagesDomain() above instead.
async function createCname(subdomain, target) {
  const res  = await fetch(`${CF_API}/zones/${ZONE_ID()}/dns_records`, {
    method:  'POST',
    headers: jsonHeaders(),
    body:    JSON.stringify({
      type:    'CNAME',
      name:    subdomain,
      content: target,
      proxied: true,
      ttl:     1,
    }),
  });
  const data = await res.json();
  if (!data.success) {
    const alreadyExists = data.errors?.some(e => e.code === 81053);
    if (!alreadyExists) {
      throw new Error(`DNS CNAME create failed: ${JSON.stringify(data.errors)}`);
    }
    console.log(`[CF] CNAME ${subdomain} already exists — skipping`);
    return null;
  }
  return data.result;
}

module.exports = { createPagesProject, deployToPages, addPagesDomain, deleteDnsRecords, createCname };
