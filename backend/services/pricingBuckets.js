/**
 * pricingBuckets.js — shared niche→bucket + bucket→pricing lookup for the
 * flat-monthly-retainer model (locked August 17, 2026, session 27 — see
 * CLAUDE.md "Pricing — flat monthly retainer + niche-bucketed activation fee").
 *
 * Originally only 7 of the 11 active niches were assigned a bucket:
 * HVAC/Plumbing/Electrical → bucket 2, Lawn Care/Pest Control → bucket 1,
 * Solar/Roofing → bucket 3. Landscaping, Water Damage, Tree Service, and
 * Pool Service sat unmapped (pricing_bucket = NULL at signup) per Jose's
 * explicit call in session 34/35 not to guess.
 *
 * Assigned September 25, 2026, using the same deal-size/frequency logic
 * already established in CLAUDE.md's historical Niche-Adaptive Pricing
 * table (per-booking rate + typical job value per niche):
 *  - Water Damage → bucket 2 (mid-ticket, $1,500-5,000/job, high urgency —
 *    same profile as HVAC/plumbing/electrical, historical rate $150/booking)
 *  - Tree Service → bucket 2 (mid-ticket, $200-5,000/job spanning
 *    trim/removal/storm damage, historical rate $75/booking — exact match
 *    to HVAC's rate)
 *  - Pool Service → bucket 2 (mid-ticket, $300-2,000/job equipment repair,
 *    per-appointment structure like HVAC, historical rate $85/booking)
 *  - Landscaping (design/install) → bucket 3 (high-ticket/low-frequency,
 *    $3,000-20,000/project — same profile as solar/roofing, not to be
 *    confused with lawn mowing/maintenance, which stays out of scope here)
 * All 11 active niches now have a bucket. New niches added later should
 * still be assigned deliberately using this same logic, not defaulted.
 */

const NICHE_TO_BUCKET = {
  'hvac': '2',
  'plumbing': '2',
  'electrical': '2',
  'water damage': '2',
  'tree service': '2',
  'pool service': '2',
  'lawn care': '1',
  'pest control': '1',
  'solar': '3',
  'roofing': '3',
  'landscaping': '3',
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
  return `$${p.activation} one-time to get set up, plus $${p.retainer}/month (both are charged when you check out, then the $${p.retainer} repeats monthly)`;
}

module.exports = { NICHE_TO_BUCKET, BUCKET_PRICING, resolveBucketForNiche, formatBucketPricing };
