const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── List all niches (public — used by booking form + admin) ───────────────────
router.get('/', async (req, res) => {
  const niches = await db.prepare('SELECT * FROM niches ORDER BY name').all();
  res.json(niches);
});

// ── Create niche (admin) ──────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const existing = await db.prepare('SELECT id FROM niches WHERE LOWER(name) = LOWER($1)').get(name.trim());
  if (existing) return res.status(409).json({ error: 'A niche with that name already exists' });

  const id = uuidv4();
  await db.prepare('INSERT INTO niches (id, name, description) VALUES ($1, $2, $3)')
    .run(id, name.trim(), description?.trim() || null);

  res.status(201).json({ id, name: name.trim(), description: description?.trim() || null });
});

// ── Update niche (admin) ──────────────────────────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  const niche = await db.prepare('SELECT * FROM niches WHERE id = $1').get(req.params.id);
  if (!niche) return res.status(404).json({ error: 'Niche not found' });

  await db.prepare(`
    UPDATE niches SET
      name        = COALESCE($1, name),
      description = COALESCE($2, description)
    WHERE id = $3
  `).run(name?.trim() || null, description?.trim() || null, req.params.id);

  res.json({ message: 'Niche updated' });
});

// ── Delete niche (admin) ──────────────────────────────────────────────────────
// Blocked if any contractor or lead references this niche
router.delete('/:id', requireAdmin, async (req, res) => {
  const niche = await db.prepare('SELECT * FROM niches WHERE id = $1').get(req.params.id);
  if (!niche) return res.status(404).json({ error: 'Niche not found' });

  const usedByContractor = await db.prepare('SELECT id FROM contractors WHERE niche_id = $1 LIMIT 1').get(req.params.id);
  if (usedByContractor) {
    return res.status(409).json({ error: 'Cannot delete — one or more contractors are assigned to this niche' });
  }

  const usedByLead = await db.prepare('SELECT id FROM leads WHERE niche_id = $1 LIMIT 1').get(req.params.id);
  if (usedByLead) {
    return res.status(409).json({ error: 'Cannot delete — leads exist for this niche' });
  }

  await db.prepare('DELETE FROM niches WHERE id = $1').run(req.params.id);
  res.json({ message: 'Niche deleted' });
});

module.exports = router;
