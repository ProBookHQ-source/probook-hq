'use strict';

const crypto      = require('crypto');
const path        = require('path');
const fs          = require('fs');
const os          = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

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
// Uses Wrangler CLI (Cloudflare's own battle-tested deploy tool) rather than
// the raw Direct Upload API. This eliminates all multipart/gzip complexity.
// Wrangler is installed as a backend dependency and invoked as a child process.
async function deployToPages(projectName, htmlContent) {
  // Write HTML to a temp directory for Wrangler
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'tractify-'));
  const htmlPath = path.join(tmpDir, 'index.html');

  try {
    fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

    // Path to wrangler binary installed in backend/node_modules
    // __dirname = backend/services/, so ../node_modules = backend/node_modules
    const wranglerBin = path.join(__dirname, '../node_modules/.bin/wrangler');

    console.log(`[CF-WRANGLER] Deploying ${htmlContent.length} bytes to ${projectName}`);

    const { stdout, stderr } = await execFileAsync(
      wranglerBin,
      [
        'pages', 'deploy', tmpDir,
        `--project-name=${projectName}`,
        '--branch=main',
        '--commit-dirty=true',
      ],
      {
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN:  process.env.CLOUDFLARE_API_TOKEN,
          CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
          // Suppress wrangler telemetry prompts
          WRANGLER_SEND_METRICS: 'false',
          NO_COLOR: '1',
        },
        timeout: 120_000, // 2-minute timeout
      }
    );

    const output = (stdout + stderr).trim();
    console.log(`[CF-WRANGLER] ${output}`);
    return { url: `https://${projectName}.pages.dev` };

  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  }
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
