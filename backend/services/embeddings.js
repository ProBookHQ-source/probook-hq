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
 * voyageRequest(body) — makes one POST to Voyage embeddings API, returns parsed JSON
 */
function voyageRequest(body) {
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
          resolve({ status: res.statusCode, body: JSON.parse(data) });
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
 * embed(text) — converts a string to a 512-dimensional float vector.
 * Retries up to 4 times with exponential backoff on rate limit errors.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
  if (!VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY not set — add it to Railway env vars');
  }

  const body = JSON.stringify({ input: [text], model: VOYAGE_MODEL });
  const delays = [5000, 10000, 20000, 30000]; // backoff on 429

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const { status, body: parsed } = await voyageRequest(body);

    if (status === 429 || parsed.detail?.toLowerCase().includes('rate')) {
      if (attempt === delays.length) throw new Error('Voyage rate limit — all retries exhausted');
      const wait = delays[attempt];
      console.log(`[EMBEDDINGS] Rate limited — waiting ${wait / 1000}s before retry ${attempt + 1}...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (parsed.error) throw new Error(`Voyage API: ${JSON.stringify(parsed.error)}`);
    const vector = parsed.data?.[0]?.embedding;
    if (!vector) throw new Error(`Voyage API returned no embedding. Status: ${status}. Body: ${JSON.stringify(parsed).slice(0, 200)}`);
    return vector;
  }
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
