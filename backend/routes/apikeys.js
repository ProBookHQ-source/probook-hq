const express = require('express');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes are admin-only
router.use(requireAdmin);

// ── List all API keys ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const keys = await db.prepare(`
    SELECT k.id, k.name, k.source_slug, k.is_active, k.created_at, k.last_used_at,
           k.contractor_id, k.allowed_origins,
           c.name as contractor_name, c.company_name as contractor_company
    FROM inbound_api_keys k
    LEFT JOIN contractors c ON k.contractor_id = c.id
    ORDER BY k.created_at DESC
  `).all();
  res.json(keys);
});

// ── Create a new API key ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, source_slug, contractor_id, allowed_origins } = req.body;
  if (!name || !source_slug) {
    return res.status(400).json({ error: 'name and source_slug are required' });
  }

  const slug    = source_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const key     = 'pb_' + crypto.randomBytes(24).toString('hex');
  const id      = uuidv4();
  const origins = allowed_origins ? allowed_origins.trim() : null;

  await db.prepare(`
    INSERT INTO inbound_api_keys (id, name, key, source_slug, is_active, contractor_id, allowed_origins)
    VALUES ($1, $2, $3, $4, 1, $5, $6)
  `).run(id, name.trim(), key, slug, contractor_id || null, origins);

  // Return the full key ONCE — it won't be shown again
  res.status(201).json({ id, name: name.trim(), source_slug: slug, key, is_active: 1, contractor_id: contractor_id || null, allowed_origins: origins });
});

// ── Assign / update the dedicated contractor on an existing key ───────────────
router.put('/:id/contractor', async (req, res) => {
  const { contractor_id } = req.body;
  const key = await db.prepare('SELECT id FROM inbound_api_keys WHERE id = $1').get(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key not found' });
  await db.prepare('UPDATE inbound_api_keys SET contractor_id = $1 WHERE id = $2')
    .run(contractor_id || null, req.params.id);
  res.json({ message: 'Contractor assignment updated' });
});

// ── Update allowed origins on an existing key ─────────────────────────────────
router.put('/:id/origins', async (req, res) => {
  const { allowed_origins } = req.body;
  const key = await db.prepare('SELECT id FROM inbound_api_keys WHERE id = $1').get(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key not found' });
  await db.prepare('UPDATE inbound_api_keys SET allowed_origins = $1 WHERE id = $2')
    .run(allowed_origins ? allowed_origins.trim() : null, req.params.id);
  res.json({ message: 'Allowed origins updated' });
});

// ── Deactivate a key ──────────────────────────────────────────────────────────
router.put('/:id/deactivate', async (req, res) => {
  const key = await db.prepare('SELECT id FROM inbound_api_keys WHERE id = $1').get(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key not found' });
  await db.prepare('UPDATE inbound_api_keys SET is_active = 0 WHERE id = $1').run(req.params.id);
  res.json({ message: 'Key deactivated' });
});

// ── Reactivate a key ─────────────────────────────────────────────────────────
router.put('/:id/activate', async (req, res) => {
  const key = await db.prepare('SELECT id FROM inbound_api_keys WHERE id = $1').get(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key not found' });
  await db.prepare('UPDATE inbound_api_keys SET is_active = 1 WHERE id = $1').run(req.params.id);
  res.json({ message: 'Key activated' });
});

// ── Delete a key ──────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const key = await db.prepare('SELECT id FROM inbound_api_keys WHERE id = $1').get(req.params.id);
  if (!key) return res.status(404).json({ error: 'Key not found' });
  await db.prepare('DELETE FROM inbound_api_keys WHERE id = $1').run(req.params.id);
  res.json({ message: 'Key deleted' });
});

module.exports = router;
