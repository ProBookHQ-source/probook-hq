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
// Uses the Cloudflare Pages Direct Upload API (multipart/form-data).
// The manifest maps file paths → sha256 hashes; each hash is a separate part.
async function deployToPages(projectName, htmlContent) {
  const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
  const hash       = crypto.createHash('sha256').update(htmlBuffer).digest('hex');
  const boundary   = `TractifyDeploy${Date.now()}`;

  const body = Buffer.concat([
    // Part 1: manifest
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="manifest"\r\n`),
    Buffer.from(`Content-Type: application/json\r\n`),
    Buffer.from(`\r\n`),
    Buffer.from(`{"index.html":"${hash}"}`),
    Buffer.from(`\r\n`),
    // Part 2: the HTML file (named by its hash)
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="${hash}"\r\n`),
    Buffer.from(`Content-Type: text/html\r\n`),
    Buffer.from(`\r\n`),
    htmlBuffer,
    Buffer.from(`\r\n`),
    // Close delimiter
    Buffer.from(`--${boundary}--\r\n`),
  ]);

  const res  = await fetch(
    `${CF_API}/accounts/${ACCOUNT_ID()}/pages/projects/${projectName}/deployments`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${API_TOKEN()}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    }
  );
  const data = await res.json();
  if (!data.success) {
    throw new Error(`Pages deploy failed: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

// ── Create a CNAME record pointing subdomain → pages.dev URL ─────────────────
// subdomain: e.g. "premiercomforthvac"   (no domain suffix — CF adds tractifyhq.com)
// target:    e.g. "tractify-premiercomforthvac.pages.dev"
async function createCname(subdomain, target) {
  const res  = await fetch(`${CF_API}/zones/${ZONE_ID()}/dns_records`, {
    method:  'POST',
    headers: jsonHeaders(),
    body:    JSON.stringify({
      type:    'CNAME',
      name:    subdomain,             // CF appends .tractifyhq.com automatically
      content: target,
      proxied: true,
      ttl:     1,                     // 1 = automatic TTL (required when proxied)
    }),
  });
  const data = await res.json();
  if (!data.success) {
    // Ignore "already exists" error (code 81053) — idempotent re-runs
    const alreadyExists = data.errors?.some(e => e.code === 81053);
    if (!alreadyExists) {
      throw new Error(`DNS CNAME create failed: ${JSON.stringify(data.errors)}`);
    }
    console.log(`[CF] CNAME ${subdomain} already exists — skipping`);
    return null;
  }
  return data.result;
}

module.exports = { createPagesProject, deployToPages, createCname };
