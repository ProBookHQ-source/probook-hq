// ── Shared Twilio number pool ──────────────────────────────────────────────────
// Built session 27 (August 17, 2026) — see CLAUDE.md "⚡ PICK UP HERE" STEP 2a.
//
// THE PIVOT's signup design calls for a number to be assigned instantly from a
// small pool Tractify already owns, at near-zero incremental cost, rather than
// buying a brand-new number per signup. If a contractor converts, the number
// they were trialing on becomes permanently theirs (no swap). If they don't
// convert — decline, or simply go dark — the number is released back to the
// pool for the next trial.
//
// This file owns all reads/writes to `twilio_number_pool` and is the single
// place that should ever flip a pool number's status. Nothing else should
// UPDATE that table directly.
//
// Numbers get INTO the pool by Jose buying them in the Twilio console (same as
// today) and registering them here via POST /api/twilio-pool — this does not
// automate the Twilio purchase itself, only the assignment/release bookkeeping
// around numbers Jose has already bought.

const db = require('../database/db');

/**
 * Pull one available number from the pool and assign it to a contractor.
 * Non-fatal by design — a signup should never fail because the pool is
 * temporarily empty. Returns the assigned phone number, or null if none
 * were available (in which case an admin alert is the caller's job).
 */
async function assignPoolNumber(contractorId) {
  // Single atomic UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED).
  // A separate SELECT-then-UPDATE would run as two independent implicit
  // transactions in pg — the row lock from the SELECT releases before the
  // UPDATE even runs, so two concurrent signups could both grab the same
  // "available" number. Folding it into one statement keeps the pick-and-claim
  // atomic under real concurrency.
  const { rows } = await db.query(`
    UPDATE twilio_number_pool
    SET status = 'assigned', assigned_contractor_id = $1, assigned_at = NOW(), released_at = NULL, release_reason = NULL
    WHERE id = (
      SELECT id FROM twilio_number_pool
      WHERE status = 'available'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, phone_number
  `, [contractorId]);

  if (!rows.length) {
    console.warn(`[TWILIO-POOL] No available numbers — contractor ${contractorId} signed up with no Twilio number assigned.`);
    return null;
  }

  const pool = rows[0];

  await db.query(`
    UPDATE contractors SET twilio_number = $1, twilio_pool_id = $2 WHERE id = $3
  `, [pool.phone_number, pool.id, contractorId]);

  console.log(`[TWILIO-POOL] Assigned ${pool.phone_number} → contractor ${contractorId}`);

  // Fire the welcome SMS the same way contractors.js PUT /:id does when a
  // number is manually set — replicated here since pool assignment writes
  // straight to the DB and doesn't go through that route.
  try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const { sendWelcomeText } = require('./smsAI');
      const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const fresh = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(contractorId);
      if (fresh && !fresh.sms_welcome_sent) {
        await sendWelcomeText(fresh, twilioClient);
        console.log(`[TWILIO-POOL] Welcome SMS sent to ${fresh.name} (${contractorId})`);
      }
    }
  } catch (err) {
    // Non-fatal — the number is still assigned successfully either way
    console.error('[TWILIO-POOL] Welcome SMS failed:', err.message);
  }

  return pool.phone_number;
}

/**
 * Release a contractor's pool-assigned number back to 'available' so the next
 * signup can use it. Call this on decline and on "gone dark" auto-release.
 * Does nothing (safely) if the contractor never had a pool number, or if their
 * number has already been marked 'converted' (a paying contractor's number is
 * never released — see markPoolNumberConverted below).
 */
async function releasePoolNumber(contractorId, reason = 'unspecified') {
  const { rows } = await db.query(`
    SELECT id, status FROM twilio_number_pool WHERE assigned_contractor_id = $1
  `, [contractorId]);

  if (!rows.length) return false; // never had a pool number — nothing to do
  if (rows[0].status === 'converted') return false; // paying contractor — never released automatically

  await db.query(`
    UPDATE twilio_number_pool
    SET status = 'available', assigned_contractor_id = NULL, released_at = NOW(), release_reason = $1
    WHERE id = $2
  `, [reason, rows[0].id]);

  await db.query(`
    UPDATE contractors
    SET twilio_number = NULL, twilio_pool_id = NULL, sms_welcome_sent = 0
    WHERE id = $1
  `, [contractorId]);

  console.log(`[TWILIO-POOL] Released number from contractor ${contractorId} (reason: ${reason})`);
  return true;
}

/**
 * Mark a contractor's pool number as permanently theirs at conversion. Removes
 * it from rotation for good — a converted contractor's number is never reused
 * even if they later churn (churn/offboarding uses the separate
 * `twilio_hold_until` 6-month-hold mechanic on `contractors`, not this pool).
 *
 * Not yet called from anywhere — this is the hook Stripe conversion (STEP 3,
 * CLAUDE.md ⚡ PICK UP HERE) should call the moment a contractor's payment
 * fires. Exported now so that build doesn't also have to touch this file.
 */
async function markPoolNumberConverted(contractorId) {
  const { rows } = await db.query(`
    SELECT id FROM twilio_number_pool WHERE assigned_contractor_id = $1 AND status = 'assigned'
  `, [contractorId]);
  if (!rows.length) return false;

  await db.query(`UPDATE twilio_number_pool SET status = 'converted' WHERE id = $1`, [rows[0].id]);
  console.log(`[TWILIO-POOL] Number converted (permanent) for contractor ${contractorId}`);
  return true;
}

/** Admin action — register a number Jose has already bought in the Twilio console. */
async function addNumberToPool(phoneNumber) {
  const { v4: uuidv4 } = require('uuid');
  const id = uuidv4();
  await db.query(`
    INSERT INTO twilio_number_pool (id, phone_number, status)
    VALUES ($1, $2, 'available')
    ON CONFLICT (phone_number) DO NOTHING
  `, [id, phoneNumber]);
  return id;
}

/** Admin visibility — counts by status, plus the full row list. */
async function getPoolStats() {
  const { rows: counts } = await db.query(`
    SELECT status, COUNT(*)::int AS count FROM twilio_number_pool GROUP BY status
  `);
  const { rows: all } = await db.query(`
    SELECT p.*, c.name AS contractor_name, c.company_name
    FROM twilio_number_pool p
    LEFT JOIN contractors c ON c.id = p.assigned_contractor_id
    ORDER BY p.status = 'available' DESC, p.created_at ASC
  `);
  const byStatus = { available: 0, assigned: 0, converted: 0, disabled: 0 };
  for (const row of counts) byStatus[row.status] = row.count;
  return { counts: byStatus, numbers: all };
}

module.exports = {
  assignPoolNumber,
  releasePoolNumber,
  markPoolNumberConverted,
  addNumberToPool,
  getPoolStats,
};
