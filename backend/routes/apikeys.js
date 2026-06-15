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
  const keys = await db.prepare(
    'SELECT id, name, source_slug, is_active, created_at, last_used_at FROM inbound_api_keys ORDER BY created_at DESC'
  ).all();
  res.json(keys);
});

// ── Create a new API key ──────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, source_slug } = req.body;
  if (!name || !source_slug) {
    return res.status(400).json({ error: 'name and source_slug are required' });
  }

  const slug = source_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const key  = 'pb_' + crypto.randomBytes(24).toString('hex'); // pb_<48 hex chars>
  const id   = uuidv4();

  await db.prepare(`
    INSERT INTO inbound_api_keys (id, name, key, source_slug, is_active)
    VALUES ($1, $2, $3, $4, 1)
  `).run(id, name.trim(), key, slug);

  // Return the full key ONCE — it won't be shown again
  res.status(201).json({ id, name: name.trim(), source_slug: slug, key, is_active: 1 });
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
