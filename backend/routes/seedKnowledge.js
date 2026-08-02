/**
 * POST /api/admin/seed-knowledge
 *
 * One-time admin endpoint to seed RAG diagnostic knowledge from within Railway's
 * network (where postgres.railway.internal is reachable). Protected by admin JWT.
 *
 * Usage:
 *   curl -X POST "https://tractifyhq.com/api/admin/seed-knowledge?niche=solar" \
 *     -H "Authorization: Bearer <admin_jwt>"
 *
 *   # Load all 6 new niches at once (runs sequentially, ~15s pause between each):
 *   curl -X POST "https://tractifyhq.com/api/admin/seed-knowledge" \
 *     -H "Authorization: Bearer <admin_jwt>"
 *
 * Query params:
 *   ?niche=solar           — load a single niche
 *   ?niche=solar,water_damage  — comma-separated list
 *   (none)                 — load all 6 new niches
 */

const express  = require('express');
const router   = express.Router();
const { requireAdmin } = require('../middleware/auth');

// Default: the 6 new niches added in session 18 (August 2026)
const NEW_NICHES = ['solar', 'water_damage', 'tree_service', 'lawn_care', 'pool_service', 'pest_control'];

router.post('/', requireAdmin, async (req, res) => {
  try {
    // Determine which niches to load
    let nicheParam = req.query.niche;
    let nichesToLoad;

    if (nicheParam) {
      nichesToLoad = nicheParam.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      nichesToLoad = NEW_NICHES;
    }

    console.log(`[SEED-KNOWLEDGE] Starting knowledge seed for: ${nichesToLoad.join(', ')}`);

    // Respond immediately so the HTTP connection doesn't time out — seeding takes
    // ~15s per niche. The actual work runs in the background and logs to Railway.
    res.json({
      ok: true,
      message: `Seeding started for: ${nichesToLoad.join(', ')}. Check Railway logs for progress.`,
      niches: nichesToLoad,
    });

    // Run the seeder in the background (after response is sent)
    setImmediate(async () => {
      try {
        const { loadNiches } = require('../scripts/loadDiagnosticKnowledge');
        await loadNiches(nichesToLoad);
        console.log(`[SEED-KNOWLEDGE] ✅ Complete for: ${nichesToLoad.join(', ')}`);
      } catch (err) {
        console.error('[SEED-KNOWLEDGE] ❌ Error during seeding:', err.message);
      }
    });

  } catch (err) {
    console.error('[SEED-KNOWLEDGE] Route error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
