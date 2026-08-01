/**
 * diagnosticKnowledge.js — RAG retrieval for Brain 3 diagnostics
 *
 * On every homeowner SMS, embeds the incoming message and retrieves the
 * most semantically relevant knowledge chunks from the diagnostic_knowledge
 * table (filtered by niche). Only relevant knowledge loads — not the entire
 * niche encyclopedia. This keeps Brain 3's context lean and response sharp.
 *
 * Adding a new niche = inserting rows into diagnostic_knowledge. Zero code changes.
 */

const db           = require('../database/db');
const { embed, embedBatch } = require('./embeddings');

// Niche name normalization — intake form niches → DB niche keys
const NICHE_MAP = {
  'hvac':                'hvac',
  'HVAC':                'hvac',
  'Roofing':             'roofing',
  'roofing':             'roofing',
  'Electrical':          'electrical',
  'electrical':          'electrical',
  'Plumbing':            'plumbing',
  'plumbing':            'plumbing',
  'Landscaping':         'landscaping',
  'landscaping':         'landscaping',
  'Painting':            'painting',
  'painting':            'painting',
  'General Contracting': 'general',
  'general contracting': 'general',
};

function normalizeNiche(name) {
  return NICHE_MAP[name] || (name || 'hvac').toLowerCase().replace(/\s+/g, '_');
}

/**
 * getRelevantKnowledge(messageText, nicheName, limit)
 *
 * Embeds the homeowner's message, searches diagnostic_knowledge by cosine
 * similarity, returns the top chunks as a formatted string ready to inject
 * into Brain 3's system prompt.
 *
 * Fails gracefully — if Voyage API is down or table is empty, returns ''
 * so Brain 3 still responds (just without injected knowledge).
 *
 * @param {string} messageText  — the homeowner's SMS text
 * @param {string} nicheName    — contractor's niche (e.g. 'HVAC', 'Roofing')
 * @param {number} limit        — max chunks to retrieve (default 5)
 * @returns {Promise<string>}   — formatted knowledge string for prompt injection
 */
async function getRelevantKnowledge(messageText, nicheName, limit = 5) {
  if (!messageText || !nicheName) return '';

  try {
    const niche     = normalizeNiche(nicheName);
    const vector    = await embed(messageText);
    const vectorStr = `[${vector.join(',')}]`;

    const { rows } = await db.query(`
      SELECT content, urgency, safety_flag, category,
             1 - (embedding <=> $1::vector) AS similarity
      FROM diagnostic_knowledge
      WHERE niche = $2
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [vectorStr, niche, limit]);

    if (!rows.length) return '';

    // Safety-flagged chunks always surface first
    rows.sort((a, b) => {
      if (a.safety_flag && !b.safety_flag) return -1;
      if (!a.safety_flag && b.safety_flag) return 1;
      return 0;
    });

    return rows.map(r => r.content).join('\n\n');
  } catch (err) {
    // Non-fatal — Brain 3 responds without injected knowledge
    console.error('[DIAGNOSTIC] Knowledge retrieval failed:', err.message);
    return '';
  }
}

/**
 * storeKnowledgeChunk(chunk)
 *
 * Embeds and stores a single knowledge chunk. Used by the load script.
 *
 * @param {object} chunk
 * @param {string} chunk.niche
 * @param {string} chunk.category
 * @param {string[]} chunk.symptom_tags
 * @param {string} chunk.content
 * @param {string} chunk.urgency   — 'immediate' | 'this_week' | 'schedule' | 'diy_first' | 'emergency_911'
 * @param {boolean} chunk.safety_flag
 */
async function storeKnowledgeChunk({ niche, category, symptom_tags, content, urgency = 'schedule', safety_flag = false }) {
  const vector    = await embed(content);
  const vectorStr = `[${vector.join(',')}]`;

  await db.query(`
    INSERT INTO diagnostic_knowledge (niche, category, symptom_tags, content, embedding, urgency, safety_flag)
    VALUES ($1, $2, $3, $4, $5::vector, $6, $7)
  `, [
    normalizeNiche(niche),
    category || null,
    symptom_tags || [],
    content,
    vectorStr,
    urgency,
    safety_flag,
  ]);
}

/**
 * storeKnowledgeBatch(chunks)
 *
 * Batch-embeds and stores multiple chunks efficiently. Uses one Voyage API
 * call per batch of 128 chunks (Voyage's max input size).
 *
 * @param {object[]} chunks — array of chunk objects (same shape as storeKnowledgeChunk)
 */
async function storeKnowledgeBatch(chunks) {
  // Embed one chunk at a time to avoid Voyage AI rate limits on large text batches.
  // Each PLUMBING/HVAC chunk is a long paragraph — batching all at once hits token limits.
  for (let i = 0; i < chunks.length; i++) {
    const chunk  = chunks[i];
    const vector = await embed(chunk.content);
    const vectorStr = `[${vector.join(',')}]`;

    await db.query(`
      INSERT INTO diagnostic_knowledge (niche, category, symptom_tags, content, embedding, urgency, safety_flag)
      VALUES ($1, $2, $3, $4, $5::vector, $6, $7)
      ON CONFLICT DO NOTHING
    `, [
      normalizeNiche(chunk.niche),
      chunk.category || null,
      chunk.symptom_tags || [],
      chunk.content,
      vectorStr,
      chunk.urgency || 'schedule',
      chunk.safety_flag || false,
    ]);

    console.log(`[DIAGNOSTIC] Stored chunk ${i + 1} of ${chunks.length}`);
    // Small pause between individual embeddings to respect rate limits
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
  }
}

/**
 * clearNicheKnowledge(nicheName)
 *
 * Removes all knowledge chunks for a niche. Use before reloading
 * updated knowledge for a niche.
 */
async function clearNicheKnowledge(nicheName) {
  const niche = normalizeNiche(nicheName);
  const { rowCount } = await db.query(`DELETE FROM diagnostic_knowledge WHERE niche = $1`, [niche]);
  console.log(`[DIAGNOSTIC] Cleared ${rowCount} chunks for niche: ${niche}`);
}

module.exports = {
  getRelevantKnowledge,
  storeKnowledgeChunk,
  storeKnowledgeBatch,
  clearNicheKnowledge,
};
