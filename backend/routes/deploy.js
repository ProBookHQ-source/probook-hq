'use strict';

/**
 * POST /api/deploy
 *
 * Called by the Cloudflare Worker after a contractor submits the intake form.
 * Fully automates: contractor account creation → API key → HVAC site deploy →
 * Cloudflare Pages → CNAME → availability pre-population → welcome email.
 *
 * Auth: Authorization: Bearer {DEPLOY_SECRET}
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');

const db           = require('../database/db');
const { sendContractorWelcomeEmail, sendDeployAlertToAdmin } = require('../services/notifications');
const { deployToPages, addPagesDomain } = require('../services/cloudflare');

const router = express.Router();

// ── Auth middleware — shared secret set in Railway env ────────────────────────
function requireDeploySecret(req, res, next) {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) {
    // If secret isn't configured, reject all deploys (fail safe)
    console.error('[DEPLOY] DEPLOY_SECRET env var not set — rejecting request');
    return res.status(503).json({ error: 'Deploy service not configured' });
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) {
    console.warn('[DEPLOY] Invalid deploy secret from IP:', req.ip);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Slug generator — "Premier Comfort HVAC" → "premiercomforthvac" ────────────
function generateSlug(businessName) {
  return (businessName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 50) || `contractor${Date.now()}`;
}

// ── Convert "7:00 AM" / "7:00 PM" to "07:00:00" for DB ───────────────────────
function parseTime12h(timeStr) {
  if (!timeStr || timeStr.toLowerCase() === 'closed') return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${min}:00`;
}

// ── Build the CLIENT config JavaScript block for injection into the template ──
function buildClientConfig(data, apiKey, slug) {
  function esc(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  const subdomainUrl = `https://${slug}.tractifyhq.com`;
  const phoneRaw = (data.phone || '').replace(/\D/g, '');
  const hrs = data.hoursRaw || {};

  const wdOpen   = hrs.wdOpen   || '7:00 AM';
  const wdClose  = hrs.wdClose  || '7:00 PM';
  const satOpen  = hrs.satOpen  || '8:00 AM';
  const satClose = hrs.satClose || '5:00 PM';
  const sunOpen  = hrs.sunOpen  || 'Closed';
  const sunClose = hrs.sunClose || 'Closed';

  const wdStr  = wdOpen  === 'Closed' ? 'Closed' : `${wdOpen} – ${wdClose}`;
  const satStr = satOpen === 'Closed' ? 'Closed' : `${satOpen} – ${satClose}`;
  const sunStr = sunOpen === 'Closed' ? 'Closed' : `${sunOpen} – ${sunClose}`;

  const zips = Array.isArray(data.zips) && data.zips.length > 0 ? data.zips : ['*'];
  const zipChunks = [];
  for (let i = 0; i < zips.length; i += 12) {
    zipChunks.push('        ' + zips.slice(i, i + 12).map(z => `"${z}"`).join(', '));
  }

  const brands = Array.isArray(data.brands)
    ? data.brands.join(', ')
    : (data.brands || 'All major brands');

  const social = data.social || {};

  return `  <!-- TRACTIFY_CONFIG_START -->
  <script>
    const CLIENT = {

      // ── COMPANY INFO ─────────────────────────────────────────
      name:            "${esc(data.businessName)}",
      phone:           "${esc(data.phone)}",
      phoneRaw:        "${phoneRaw}",
      city:            "${esc(data.city)}",
      serviceArea:     "${esc(data.serviceArea || data.city)}",
      serviceZips:     [
${zipChunks.join(',\n')}
      ],
      address:         "${esc(data.address || '')}",

      // ── LOGO & BRANDING ──────────────────────────────────────
      logoTagline:     "Heating &amp; Cooling Specialists",
      logoImg:         "${esc(data.logoUrl || '')}",
      coverPhoto:      "${esc(data.coverUrl || './Coverphoto.jpg')}",
      coverPhotoFocus: "center",

      // ── SOCIAL PROOF ─────────────────────────────────────────
      reviewScore:     "${esc(data.reviewScore || '5.0')}",
      reviewCount:     "${esc(data.reviewCount || '')}",
      yearsInBusiness: "${esc(data.years || '')}",

      // ── CLAIMS & GUARANTEES ──────────────────────────────────
      warrantyYears:   "${esc(data.warrantyYears || '')}",
      responseTime:    "1 hour",

      // ── FINANCING ────────────────────────────────────────────
      financingFrom:   "${esc(data.financingFrom ? (String(data.financingFrom).startsWith('$') ? data.financingFrom : '$' + data.financingFrom) : '')}",

      // ── HERO HEADLINE ────────────────────────────────────────
      heroLine1:       "Comfort You Can",
      heroLine2:       "Count On.",

      // ── BRANDS SERVICED ──────────────────────────────────────
      brands:          "${esc(brands)}",

      // ── GOOGLE REVIEWS ───────────────────────────────────────
      googleBusinessUrl: "${esc(data.googleUrl || '')}",
      reviews: [],

      // ── TRACTIFY INTEGRATION ─────────────────────────────────
      tractifyKey:      "${esc(apiKey)}",
      sourceSite:      "${esc(slug + '.tractifyhq.com')}",
      siteUrl:         "${esc(subdomainUrl)}",
      ogImage:         "${esc(data.coverUrl || '')}",
      year:            new Date().getFullYear(),

      // ── BUSINESS HOURS ───────────────────────────────────────
      hours: {
        weekdays: "Mon – Fri: ${esc(wdStr)}",
        saturday: "Saturday: ${esc(satStr)}",
        sunday:   "Sunday: ${esc(sunStr)}",
      },

      // ── FOOTER TAGLINE ───────────────────────────────────────
      footerTagline:   "Licensed, insured, and backed by a satisfaction guarantee. We treat every home like our own.",

      // ── LICENSE & COMPLIANCE ─────────────────────────────────
      licenseNumber:   "${esc(data.licenseNumber || '')}",

      // ── SOCIAL LINKS ─────────────────────────────────────────
      social: {
        facebook:  "${esc(social.facebook  || '')}",
        instagram: "${esc(social.instagram || '')}",
        tiktok:    "${esc(social.tiktok    || '')}",
        youtube:   "${esc(social.youtube   || '')}",
        nextdoor:  "${esc(social.nextdoor  || '')}",
        google:    "${esc(data.googleUrl   || '')}",
      },

      // ── FEATURE FLAGS ────────────────────────────────────────
      // Defaults to enabled if not sent (backwards-compatible with old submissions)
      features: {
        nate:         ${data.nate         !== false},
        emergency247: ${data.emergency    !== false},
        financing:    ${data.financing    !== false},
        commercial:   ${data.commercial   !== false},
        faq:          true,
        showMap:      ${data.address ? 'true' : 'false'},
      },

    };

    const PRIMARY_COLOR = "#e85d26";
  </script>
  <!-- TRACTIFY_CONFIG_END -->`;
}

// ── Ensure slug is unique (add numeric suffix if taken) ───────────────────────
async function uniqueSlug(baseSlug) {
  let slug = baseSlug;
  let n = 2;
  while (true) {
    const row = await db.prepare('SELECT id FROM contractors WHERE booking_slug = $1').get(slug);
    if (!row) return slug;
    slug = `${baseSlug}${n++}`;
    if (n > 99) throw new Error('Could not generate unique slug after 99 attempts');
  }
}

// ── Pre-populate availability slots from intake hours ─────────────────────────
async function seedAvailability(contractorId, hoursRaw) {
  const hrs = hoursRaw || {};
  const slots = [];

  // Mon–Fri (days 1–5)
  const wdStart = parseTime12h(hrs.wdOpen);
  const wdEnd   = parseTime12h(hrs.wdClose);
  if (wdStart && wdEnd) {
    for (let day = 1; day <= 5; day++) {
      slots.push({ day, start: wdStart, end: wdEnd });
    }
  }

  // Saturday (day 6)
  const satStart = parseTime12h(hrs.satOpen);
  const satEnd   = parseTime12h(hrs.satClose);
  if (satStart && satEnd) {
    slots.push({ day: 6, start: satStart, end: satEnd });
  }

  // Sunday (day 0)
  const sunStart = parseTime12h(hrs.sunOpen);
  const sunEnd   = parseTime12h(hrs.sunClose);
  if (sunStart && sunEnd) {
    slots.push({ day: 0, start: sunStart, end: sunEnd });
  }

  for (const s of slots) {
    await db.query(
      'INSERT INTO availability_slots (id, contractor_id, day_of_week, start_time, end_time, is_active) VALUES ($1, $2, $3, $4, $5, 1)',
      [uuidv4(), contractorId, s.day, s.start, s.end]
    );
  }
  console.log(`[DEPLOY] Seeded ${slots.length} availability slot(s) for contractor ${contractorId}`);
}

// ── Main deploy handler ────────────────────────────────────────────────────────
router.post('/', requireDeploySecret, async (req, res) => {
  const data = req.body;

  // Validate required fields
  if (!data.businessName || !data.contactEmail) {
    return res.status(400).json({ error: 'businessName and contactEmail are required' });
  }

  const email = data.contactEmail.toLowerCase().trim();
  const log   = (msg) => console.log(`[DEPLOY] [${data.businessName}] ${msg}`);

  log(`Starting auto-deploy for ${email}`);
  log(`DEBUG fields — emergency:${data.emergency} warranty:${data.warranty} warrantyYears:${data.warrantyYears} financing:${data.financing} financingFrom:${data.financingFrom} nate:${data.nate} commercial:${data.commercial}`);

  // Check for duplicate email
  const existing = await db.prepare('SELECT id FROM contractors WHERE email = $1').get(email);
  if (existing) {
    log(`Contractor already exists with email ${email} — skipping`);
    return res.status(409).json({ error: 'Contractor already exists with this email', contractorId: existing.id });
  }

  // ── Step 1: Generate slug & ensure uniqueness ──────────────────────────────
  const baseSlug     = generateSlug(data.businessName);
  const slug         = await uniqueSlug(baseSlug);
  const projectName  = `tractify-${slug}`;
  const subdomainUrl = `https://${slug}.tractifyhq.com`;

  log(`Slug: ${slug} | Pages project: ${projectName}`);

  // ── Step 2: Create contractor account ─────────────────────────────────────
  const tempPassword = crypto.randomBytes(10).toString('hex'); // 20-char hex
  const contractorId = uuidv4();
  const passwordHash = bcrypt.hashSync(tempPassword, 10);

  // Look up HVAC niche ID
  const hvacNiche = await db.prepare(
    "SELECT id FROM niches WHERE LOWER(name) = 'hvac' LIMIT 1"
  ).get();
  const nicheId = hvacNiche?.id || null;

  const zips = Array.isArray(data.zips) && data.zips.length > 0
    ? JSON.stringify(data.zips)
    : JSON.stringify(['*']);

  await db.query(`
    INSERT INTO contractors
      (id, email, password_hash, name, phone, company_name, niche_id,
       service_zip_codes, is_active, status, booking_slug, onboarding_started_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,'approved',$9,NOW())
  `, [
    contractorId,
    email,
    passwordHash,
    data.contactName || data.businessName,
    data.phone || null,
    data.businessName,
    nicheId,
    zips,
    slug,
  ]);

  log(`Contractor created: ${contractorId}`);

  // ── Step 3: Create API key linked to contractor ────────────────────────────
  const apiKey      = 'pb_' + crypto.randomBytes(24).toString('hex');
  const apiKeyId    = uuidv4();
  const allowedOrigins = `${subdomainUrl},https://${slug}.tractifyhq.com`;

  await db.query(`
    INSERT INTO inbound_api_keys (id, name, key, source_slug, is_active, contractor_id, allowed_origins)
    VALUES ($1,$2,$3,$4,1,$5,$6)
  `, [apiKeyId, data.businessName, apiKey, slug, contractorId, allowedOrigins]);

  log(`API key created: ${apiKeyId}`);

  // ── Step 4: Build template HTML with injected CLIENT config ───────────────
  const templatePath = path.join(__dirname, '../templates/hvac-template.html');
  let templateHtml   = fs.readFileSync(templatePath, 'utf-8');

  const configBlock = buildClientConfig(data, apiKey, slug);

  // Replace everything between the TRACTIFY_CONFIG markers
  templateHtml = templateHtml.replace(
    /<!--\s*TRACTIFY_CONFIG_START\s*-->[\s\S]*?<!--\s*TRACTIFY_CONFIG_END\s*-->/,
    configBlock
  );

  log(`Template built (${templateHtml.length} bytes)`);

  // ── Step 5: Deploy to Cloudflare Pages (via Wrangler CLI) ────────────────
  // Non-fatal: if deploy fails, contractor account + emails still succeed.
  // Jose gets the admin alert and can manually deploy if needed.
  // Assets to deploy alongside index.html so relative URLs resolve correctly
  const templatesDir = path.join(__dirname, '../templates');
  const templateAssets = [
    { src: path.join(templatesDir, 'Coverphoto.jpg'),  dest: 'Coverphoto.jpg'  },
    { src: path.join(templatesDir, 'probooklogo.png'), dest: 'probooklogo.png' },
  ];

  let pagesResult;
  try {
    pagesResult = await deployToPages(projectName, templateHtml, templateAssets);
    log(`Pages deployment complete: ${pagesResult.url || projectName}`);
  } catch (cfError) {
    log(`Pages deploy FAILED (non-fatal): ${cfError.message}`);
    // Continue — emails and DB records are more important than the page deploy
  }

  // ── Step 6: Register custom domain with Pages ────────────────────────────
  // addPagesDomain() handles everything: registers with Pages AND creates DNS.
  // If already registered (retry), it removes and re-adds to refresh DNS.
  // Do NOT call createCname() here — a proxied CNAME to .pages.dev conflicts
  // with Pages' internal routing and causes HTTP 500.
  try {
    await addPagesDomain(projectName, `${slug}.tractifyhq.com`);
    log(`Custom domain live: ${slug}.tractifyhq.com`);
  } catch (dnsErr) {
    log(`Custom domain error: ${dnsErr.message}`);
  }

  // ── Step 7: Pre-populate availability ────────────────────────────────────
  try {
    await seedAvailability(contractorId, data.hoursRaw);
  } catch (availErr) {
    log(`Availability seed warning: ${availErr.message}`);
    // Non-fatal — contractor can set hours manually in portal
  }

  // ── Step 8: Send welcome email to contractor ──────────────────────────────
  try {
    await sendContractorWelcomeEmail({
      name:        data.contactName || data.businessName,
      email,
      company:     data.businessName,
      siteUrl:     subdomainUrl,
      portalUrl:   `${process.env.FRONTEND_URL || 'https://tractifyhq.com'}/contractor`,
      loginEmail:  email,
      password:    tempPassword,
    });
    log(`Welcome email sent to ${email}`);
  } catch (emailErr) {
    log(`Welcome email failed: ${emailErr.message}`);
    // Non-fatal — Jose gets the admin alert below
  }

  // ── Step 9: Alert admin ───────────────────────────────────────────────────
  try {
    await sendDeployAlertToAdmin({
      businessName:  data.businessName,
      contactEmail:  email,
      siteUrl:       subdomainUrl,
      contractorId,
      slug,
    });
  } catch (e) {
    log(`Admin alert failed: ${e.message}`);
  }

  log(`Deploy complete ✓`);

  res.status(201).json({
    ok:            true,
    contractorId,
    slug,
    siteUrl:       subdomainUrl,
    pagesProject:  projectName,
  });
});

module.exports = router;
