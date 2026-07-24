'use strict';

const crypto = require('crypto');
const zlib   = require('zlib');

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
// Uses the Cloudflare Pages Direct Upload API (same approach as Wrangler):
// - Files are gzip-compressed before upload
// - SHA256 hash is computed from the COMPRESSED content
// - Content-Type for file parts is application/octet-stream
// - Manifest keys use leading slash (e.g. /index.html)
async function deployToPages(projectName, htmlContent) {
  const rawBuffer  = Buffer.from(htmlContent, 'utf-8');
  const compressed = zlib.gzipSync(rawBuffer);
  const hash       = crypto.createHash('sha256').update(compressed).digest('hex');

  const form = new FormData();

  // Manifest: plain string field — must NOT be a Blob or File because undici adds
  // filename="blob" to the Content-Disposition, which makes CF treat it as a file
  // upload instead of a named field and returns "manifest field not provided".
  form.append('manifest', JSON.stringify({ '/index.html': hash }));

  // File: gzip-compressed content, part name = hash, filename = hash (Wrangler convention)
  form.append(
    hash,
    new Blob([compressed], { type: 'application/octet-stream' }),
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
  console.log(`[CF] Deployment live: ${data.result?.url || projectName}`);
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

// ── Register a custom domain on a Cloudflare Pages project ───────────────────
// This is the correct way to serve a custom subdomain from Pages.
// It registers the domain with Pages AND automatically creates the DNS record.
//
// projectName: e.g. "tractify-premiercomfort"
// domain:      e.g. "premiercomfort.tractifyhq.com"
async function addPagesDomain(projectName, domain) {
  const res  = await fetch(
    `${CF_API}/accounts/${ACCOUNT_ID()}/pages/projects/${projectName}/domains`,
    {
      method:  'POST',
      headers: jsonHeaders(),
      body:    JSON.stringify({ name: domain }),
    }
  );
  const data = await res.json();
  if (!data.success) {
    // Ignore "already exists" / "already in use" errors — idempotent re-runs
    const errMsg = JSON.stringify(data.errors || '');
    const alreadyExists =
      data.errors?.some(e =>
        e.code === 8000007 || // already added to this project
        e.code === 8000013    // already used by another project
      ) ||
      errMsg.toLowerCase().includes('already');
    if (alreadyExists) {
      console.log(`[CF] Custom domain ${domain} already registered — skipping`);
      return null;
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
