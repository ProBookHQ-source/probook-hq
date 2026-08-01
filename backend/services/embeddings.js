/**
 * embeddings.js — Voyage AI embedding wrapper
 *
 * Uses voyage-3-lite (512 dimensions, optimized for short text retrieval).
 * Endorsed by Anthropic. Fractions of a penny per call.
 *
 * Requires: VOYAGE_API_KEY in Railway env vars
 */

const https = require('https');

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL   = 'voyage-3-lite'; // 512 dims, best for short text retrieval

/**
 * embed(text) — converts a string to a 512-dimensional float vector
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not set — add it to Railway env vars');
  }

  const body = JSON.stringify({
    input: [text],
    model: VOYAGE_MODEL,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.voyageai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(`Voyage API: ${parsed.error}`));
          const vector = parsed.data?.[0]?.embedding;
          if (!vector) return reject(new Error('Voyage API returned no embedding'));
          resolve(vector);
        } catch (e) {
          reject(new Error('Voyage parse error: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * embedBatch(texts) — embed multiple strings in one API call
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not set — add it to Railway env vars');
  }

  const body = JSON.stringify({
    input: texts,
    model: VOYAGE_MODEL,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.voyageai.com',
      path: '/v1/embeddings',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(`Voyage API: ${parsed.error}`));
          const vectors = parsed.data?.sort((a, b) => a.index - b.index).map(d => d.embedding);
          if (!vectors?.length) return reject(new Error('Voyage API returned no embeddings'));
          resolve(vectors);
        } catch (e) {
          reject(new Error('Voyage parse error: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { embed, embedBatch };
