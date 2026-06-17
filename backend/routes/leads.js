const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const matchingEngine = require('../services/matchingEngine');
const { sendAdminNoMatch } = require('../services/notifications');
const { logEvent, getEvents } = require('../services/auditLog');

const router = express.Router();

// ── Get niches (public — must be above /:id so Express doesn't treat "meta" as an id)
router.get('/meta/niches', async (req, res) => {
  const niches = await db.prepare('SELECT id, name, description FROM niches ORDER BY name').all();
  res.json(niches);
});

// ── List all leads (admin) ────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req, res) => {
  const { status, niche_id } = req.query;
  let query = `
    SELECT l.*, n.name as niche_name,
           c.name as contractor_name, c.company_name as contractor_company
    FROM leads l
    LEFT JOIN niches n ON l.niche_id = n.id
    LEFT JOIN contractors c ON l.assigned_contractor_id = c.id
  `;
  const params = [];
  const conditions = [];
  if (status)   { conditions.push(`l.status = $${params.length + 1}`);   params.push(status); }
  if (niche_id) { conditions.push(`l.niche_id = $${params.length + 1}`); params.push(niche_id); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY l.created_at DESC';

  const { rows } = await db.query(query, params);
  res.json(rows);
});

// ── Get lead event history (admin) ───────────────────────────────────────────
router.get('/:id/events', requireAdmin, async (req, res) => {
  const events = await getEvents(req.params.id);
  res.json(events);
});

// ── Get single lead ───────────────────────────────────────────────────────────
router.get('/:id', requireAdmin, async (req, res) => {
  const lead = await db.prepare(`
    SELECT l.*, n.name as niche_name, c.name as contractor_name
    FROM leads l
    LEFT JOIN niches n ON l.niche_id = n.id
    LEFT JOIN contractors c ON l.assigned_contractor_id = c.id
    WHERE l.id = $1
  `).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

// ── Inbound lead from external site (bridge endpoint) ────────────────────────
// Accepts leads from any external site (OilToHeatRebate, future niche sites).
// Auth: Bearer token matching INBOUND_API_KEY env var.
// Niche resolved by slug or name — auto-created if new (future-proof).
router.post('/inbound', async (req, res) => {
  // API key check — accepts either the global INBOUND_API_KEY env var
  // or any active key from the inbound_api_keys table (per-site keys)
  const apiKey = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!apiKey) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  let keyAuthorized = false;

  // Check global fallback key first (fast, no DB hit)
  if (process.env.INBOUND_API_KEY && apiKey === process.env.INBOUND_API_KEY) {
    keyAuthorized = true;
  }

  // Check per-site keys table
  if (!keyAuthorized) {
    const siteKey = await db.prepare(
      `SELECT id FROM inbound_api_keys WHERE key = $1 AND is_active = 1 LIMIT 1`
    ).get(apiKey);
    if (siteKey) {
      keyAuthorized = true;
      // Stamp last_used_at asynchronously (don't block response)
      db.prepare('UPDATE inbound_api_keys SET last_used_at = NOW() WHERE id = $1')
        .run(siteKey.id).catch(() => {});
    }
  }

  if (!keyAuthorized) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const {
    name, email, zip_code, niche_slug,
    phone, address, source_site,
    lead_tier, lead_score,
    ...rest
  } = req.body;

  if (!name || !email || !zip_code || !niche_slug) {
    return res.status(400).json({ error: 'name, email, zip_code, and niche_slug are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Normalize email before any DB check or insert
  const normalizedEmail = email.toLowerCase().trim();

  // Deduplication: reject if same email submitted within 30 days
  const recentLead = await db.prepare(`
    SELECT id FROM leads
    WHERE email = $1 AND created_at > NOW() - INTERVAL '30 days'
    LIMIT 1
  `).get(normalizedEmail);
  if (recentLead) {
    console.log(`🔁 Duplicate inbound lead blocked — ${normalizedEmail} (within 30 days)`);
    return res.status(409).json({
      error: 'A lead with this email was already submitted recently. Please wait before submitting again.',
    });
  }

  // Resolve niche by slug — case-insensitive, partial match, auto-create if new (capped at 50)
  const slug = niche_slug.trim().toLowerCase();
  let niche = await db.prepare(`SELECT id, name FROM niches WHERE LOWER(name) = $1`).get(slug);
  if (!niche) {
    const allNiches = await db.prepare('SELECT id, name FROM niches').all();
    niche = allNiches.find(n =>
      n.name.toLowerCase().includes(slug) || slug.includes(n.name.toLowerCase())
    ) || null;

    if (!niche) {
      // Auto-create only if under the niche cap (prevents unbounded DB growth from API key abuse)
      if (allNiches.length >= 50) {
        return res.status(400).json({ error: `Unknown niche: "${niche_slug}". Please use a valid niche slug.` });
      }
      const newNicheId = uuidv4();
      const nicheDisplayName = niche_slug.charAt(0).toUpperCase() + niche_slug.slice(1).toLowerCase();
      await db.prepare(
        'INSERT INTO niches (id, name, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING'
      ).run(newNicheId, nicheDisplayName, `Auto-created from inbound lead (source: ${source_site || 'unknown'})`);
      niche = await db.prepare('SELECT id, name FROM niches WHERE id = $1').get(newNicheId);
      console.log(`🌱 Auto-created niche: ${nicheDisplayName}`);
    }
  }

  // Build metadata — strip tracking/consent fields, keep all qualifying data
  const skipFields = new Set([
    'turnstile_token','user_agent','landing_page',
    'consent_given','consent_timestamp','consent_version',
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  ]);
  const metadata = {};
  if (address) metadata.address = address;
  for (const [k, v] of Object.entries(rest)) {
    if (!skipFields.has(k) && v !== '' && v !== null && v !== undefined) {
      metadata[k] = v;
    }
  }

  // Human-readable description from qualifying fields
  const descParts = [];
  if (metadata.heating)          descParts.push(`Heating: ${metadata.heating}`);
  if (metadata.ductwork)         descParts.push(`Ductwork: ${metadata.ductwork}`);
  if (metadata.homeowner)        descParts.push(`Homeowner: ${metadata.homeowner}`);
  if (metadata.timeline)         descParts.push(`Timeline: ${metadata.timeline}`);
  if (metadata.monthly_oil_bill) descParts.push(`Oil bill: ${metadata.monthly_oil_bill}/mo`);
  if (metadata.year_built)       descParts.push(`Built: ${metadata.year_built}`);
  if (metadata.square_footage)   descParts.push(`${metadata.square_footage} sq ft`);
  if (metadata.reason)           descParts.push(`Reason: ${metadata.reason}`);
  if (metadata.income)           descParts.push(`Income: ${metadata.income}`);
  const description = descParts.join(' | ') || null;

  const id = uuidv4();
  try {
    await db.prepare(`
      INSERT INTO leads
        (id, name, email, phone, niche_id, zip_code, description,
         source_site, external_tier, external_score, metadata, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'new')
    `).run(
      id, name, normalizedEmail, phone || null, niche.id, zip_code, description,
      source_site || null,
      lead_tier || null,
      lead_score ? parseInt(lead_score) : null,
      JSON.stringify(metadata)
    );
  } catch (err) {
    console.error('Inbound lead insert error:', err);
    return res.status(500).json({ error: 'Failed to create lead' });
  }

  console.log(`🌐 Inbound lead from ${source_site || 'unknown'} — ${name} (${niche.name}, ${zip_code})`);

  // Respond immediately, run matching async
  res.status(201).json({ success: true, lead_id: id });

  let matched = false;
  try { matched = await matchingEngine.matchOnly(id); }
  catch (err) { console.error('Matching error:', err); }

  if (matched) {
    matchingEngine.sendMatchNotifications(id).catch(err =>
      console.error('Notification error:', err)
    );
  } else {
    logEvent(id, 'no_match', 'system', 'No eligible contractor found after inbound submission');
    const leadForNotif = await db.prepare('SELECT * FROM leads WHERE id = $1').get(id);
    if (leadForNotif) {
      sendAdminNoMatch(leadForNotif).catch(err =>
        console.error('Admin no-match notification error:', err)
      );
    }
  }
});

// ── Create a new lead (public) ────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, email, phone, niche_id, zip_code, description } = req.body;
  if (!name || !email || !niche_id || !zip_code) {
    return res.status(400).json({ error: 'name, email, niche_id, and zip_code are required' });
  }
  // Normalize email before any check or insert
  const normalizedEmail = email.toLowerCase().trim();
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  // Cap description length
  if (description && description.length > 2000) {
    return res.status(400).json({ error: 'Description must be 2000 characters or fewer' });
  }

  // Deduplication: reject if same email submitted within 30 days
  const recentLead = await db.prepare(`
    SELECT id FROM leads
    WHERE email = $1 AND created_at > NOW() - INTERVAL '30 days'
    LIMIT 1
  `).get(normalizedEmail);
  if (recentLead) {
    console.log(`🔁 Duplicate lead blocked — ${normalizedEmail} (within 30 days)`);
    return res.status(409).json({
      error: 'A lead with this email was already submitted recently.',
    });
  }

  const niche = await db.prepare('SELECT id FROM niches WHERE id = $1').get(niche_id);
  if (!niche) return res.status(400).json({ error: 'Invalid niche_id' });

  const id = uuidv4();
  try {
    await db.prepare(`
      INSERT INTO leads (id, name, email, phone, niche_id, zip_code, description, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
    `).run(id, name, normalizedEmail, phone || null, niche_id, zip_code, description || null);
  } catch (err) {
    console.error('Lead insert error:', err);
    return res.status(500).json({ error: 'Failed to create lead' });
  }

  let matched = false;
  try {
    matched = await matchingEngine.matchOnly(id);
  } catch (err) {
    console.error('Matching error:', err);
  }

  res.status(201).json({
    id,
    message: matched
      ? 'Lead created and contractor matched. Booking link sent to your email.'
      : 'Lead created. We will contact you shortly.',
    matched,
  });

  if (matched) {
    matchingEngine.sendMatchNotifications(id).catch(err =>
      console.error('Notification error:', err)
    );
  } else {
    logEvent(id, 'no_match', 'system', 'No eligible contractor found after public submission');
    const leadForNotif = await db.prepare('SELECT * FROM leads WHERE id = $1').get(id);
    if (leadForNotif) {
      sendAdminNoMatch(leadForNotif).catch(err =>
        console.error('Admin no-match notification error:', err)
      );
    }
  }
});

// ── Update lead (admin) ───────────────────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const { status, assigned_contractor_id } = req.body;
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  await db.prepare(`
    UPDATE leads SET
      status = COALESCE($1, status),
      assigned_contractor_id = COALESCE($2, assigned_contractor_id)
    WHERE id = $3
  `).run(status || null, assigned_contractor_id || null, req.params.id);
  res.json({ message: 'Lead updated' });
});

// ── Reassign lead to next eligible contractor, skipping the current one ───────
router.post('/:id/reassign', requireAdmin, async (req, res) => {
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!lead.assigned_contractor_id) {
    return res.status(400).json({ error: 'Lead has no assigned contractor to reassign from' });
  }
  if (!['matched', 'booked'].includes(lead.status)) {
    return res.status(400).json({ error: 'Lead must be in matched or booked status to reassign' });
  }

  const previousContractorId = lead.assigned_contractor_id;
  const matched = await matchingEngine.reassign(lead.id, previousContractorId);

  if (!matched) {
    return res.status(409).json({ error: 'No other eligible contractors available for this lead' });
  }

  logEvent(lead.id, 'reassigned', 'admin', `Reassigned away from contractor ${previousContractorId}`);

  await matchingEngine.sendMatchNotifications(lead.id);

  res.json({ message: 'Lead reassigned and new booking link sent to homeowner' });
});

// ── Manually trigger matching (admin) ─────────────────────────────────────────
router.post('/:id/match', requireAdmin, async (req, res) => {
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const matched = await matchingEngine.matchAndNotify(lead.id);
  res.json({ matched, message: matched ? 'Contractor matched and notified' : 'No available contractors found' });
});

// ── Resend booking link (admin) ───────────────────────────────────────────────
router.post('/:id/resend-link', requireAdmin, async (req, res) => {
  const lead = await db.prepare(`
    SELECT l.*, n.name as niche_name FROM leads l
    JOIN niches n ON l.niche_id = n.id WHERE l.id = $1
  `).get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!lead.assigned_contractor_id) return res.status(400).json({ error: 'Lead has no assigned contractor' });

  const contractor = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(lead.assigned_contractor_id);
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  // Expire old tokens
  await db.prepare('UPDATE booking_tokens SET used = 1 WHERE lead_id = $1 AND used = 0').run(lead.id);

  // Create new token (24 hr)
  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await db.prepare('INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)')
    .run(uuidv4(), lead.id, token, expiresAt);

  // Ensure lead status is matched
  await db.prepare("UPDATE leads SET status = 'matched' WHERE id = $1").run(lead.id);

  const { sendBookingLink } = require('../services/notifications');
  const bookingUrl = `${process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app'}/book/${token}`;
  await sendBookingLink(lead, contractor, bookingUrl);

  res.json({ message: 'Booking link resent' });
});

// ── Delete lead (admin) ───────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  const lead = await db.prepare('SELECT * FROM leads WHERE id = $1').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  // Delete related records first (FK constraints)
  await db.prepare('DELETE FROM booking_tokens WHERE lead_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM appointments WHERE lead_id = $1').run(req.params.id);
  await db.prepare('DELETE FROM leads WHERE id = $1').run(req.params.id);

  res.json({ message: 'Lead deleted' });
});

module.exports = router;
