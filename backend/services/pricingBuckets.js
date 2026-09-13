/**
 * pricingBuckets.js — shared niche→bucket + bucket→pricing lookup for the
 * flat-monthly-retainer model (locked August 17, 2026, session 27 — see
 * CLAUDE.md "Pricing — flat monthly retainer + niche-bucketed activation fee").
 *
 * Only 6 of the 11 active niches were ever explicitly assigned a bucket in
 * that pricing writeup: HVAC/Plumbing/Electrical → bucket 2, Lawn Care/Pest
 * Control → bucket 1, Solar/Roofing → bucket 3. Landscaping, Water Damage,
 * Tree Service, and Pool Service were never given a bucket — per Jose's
 * explicit call (session 34/35, Sept 13), do NOT guess a mapping for those.
 * A contractor in one of the unmapped niches gets pricing_bucket = NULL at
 * signup and stays NULL until an admin sets it by hand (via the admin
 * dashboard or the admin brain's set_pricing_bucket tool) — the 5-job/21-day
 * trigger refuses to send a real dollar offer to a contractor with no bucket
 * set, and instead alerts Jose to assign one first.
 */

const NICHE_TO_BUCKET = {
  'hvac': '2',
  'plumbing': '2',
  'electrical': '2',
  'lawn care': '1',
  'pest control': '1',
  'solar': '3',
  'roofing': '3',
};

const BUCKET_PRICING = {
  '1': { retainer: 500, activation: 600, label: 'Bucket 1 (low-ticket / high-frequency)' },
  '2': { retainer: 1000, activation: 2000, label: 'Bucket 2 (mid-ticket)' },
  '3': { retainer: 1800, activation: 3500, label: 'Bucket 3 (high-ticket / low-frequency)' },
};

/** Resolve a bucket ('1'|'2'|'3') from a niche name, or null if unmapped. Case-insensitive. */
function resolveBucketForNiche(nicheName) {
  if (!nicheName) return null;
  const key = String(nicheName).trim().toLowerCase();
  return NICHE_TO_BUCKET[key] || null;
}

/** Format a bucket's pricing as a plain-English string for SMS/alerts. */
function formatBucketPricing(bucket) {
  const p = BUCKET_PRICING[String(bucket)];
  if (!p) return null;
  return `$${p.activation} one-time to get set up, then $${p.retainer}/month`;
}

module.exports = { NICHE_TO_BUCKET, BUCKET_PRICING, resolveBucketForNiche, formatBucketPricing };
