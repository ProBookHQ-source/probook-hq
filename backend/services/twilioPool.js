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
    SET status = 'assigned', assigned_contractor_id = $1, assigned_at = NOW(), released_at = NULL, release_reason = NULL,
        quarantined_until = NULL, former_contractor_id = NULL, last_inbound_at = NULL, quarantine_alert_sent_at = NULL
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
async function releasePoolNumber(contractorId, reason = 'unspecified', { force = false } = {}) {
  const { rows } = await db.query(`
    SELECT id, status FROM twilio_number_pool WHERE assigned_contractor_id = $1
  `, [contractorId]);

  if (!rows.length) return false; // never had a pool number — nothing to do
  // paying contractor — never released automatically, unless force (subscription ended)
  if (rows[0].status === 'converted' && !force) return false;

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

// ── Quarantine (Oct 13 2026) ──────────────────────────────────────────────────
// When a paying contractor churns, their number is NOT returned straight to
// 'available'. A contractor who forgot to turn off call forwarding would keep
// sending their customers' calls to a number that now belongs to a different
// contractor. Instead the number is held ('quarantined') for QUARANTINE_DAYS,
// still ours, never assigned. Inbound calls/texts to it get a "not in service"
// answer, and the former contractor is told once a week their forwarding is
// still on. A daily cron (cron.js) moves it to 'available' only after a quiet
// period, or retires it if it never goes quiet.
const QUARANTINE_DAYS = 60;
const QUIET_DAYS_REQUIRED = 14;   // no inbound traffic for this long before reuse
const MAX_QUARANTINE_DAYS = 90;   // still getting traffic after this → retire it
const ALERT_COOLDOWN_DAYS = 7;    // at most one "forwarding still on" text per week

/**
 * Put a churned contractor's number into quarantine. Frees the contractor row
 * (twilio_number cleared) but keeps the number ours. Returns true if a pool row
 * was quarantined, false if the contractor had no pool number.
 */
async function quarantinePoolNumber(contractorId, reason = 'subscription_ended') {
  const { rows } = await db.query(`
    SELECT id FROM twilio_number_pool WHERE assigned_contractor_id = $1
  `, [contractorId]);
  if (!rows.length) return false;

  await db.query(`
    UPDATE twilio_number_pool
    SET status = 'quarantined', assigned_contractor_id = NULL, former_contractor_id = $1,
        released_at = NOW(), release_reason = $2,
        quarantined_until = NOW() + ($3 || ' days')::interval,
        last_inbound_at = NULL, quarantine_alert_sent_at = NULL
    WHERE id = $4
  `, [contractorId, reason, String(QUARANTINE_DAYS), rows[0].id]);

  await db.query(`
    UPDATE contractors
    SET twilio_number = NULL, twilio_pool_id = NULL, sms_welcome_sent = 0
    WHERE id = $1
  `, [contractorId]);

  console.log(`[TWILIO-POOL] Quarantined number for contractor ${contractorId} for ${QUARANTINE_DAYS} days (reason: ${reason})`);
  return true;
}

/** Returns the quarantined pool row for a Twilio number, or null. */
async function getQuarantinedByNumber(phoneNumber) {
  if (!phoneNumber) return null;
  const { rows } = await db.query(`
    SELECT * FROM twilio_number_pool WHERE phone_number = $1 AND status = 'quarantined'
  `, [phoneNumber]);
  return rows[0] || null;
}

/**
 * A call or text just hit a quarantined number, which means the former
 * contractor's forwarding is (probably) still on. Record it so the number is not
 * released early, and — at most once per ALERT_COOLDOWN_DAYS — text the former
 * contractor how to turn forwarding off and email Jose. Never throws.
 */
async function recordQuarantinedContact(poolRow, { channel = 'call', from = '' } = {}) {
  try {
    await db.query(`UPDATE twilio_number_pool SET last_inbound_at = NOW() WHERE id = $1`, [poolRow.id]);

    // Atomic claim: only one concurrent webhook gets to send the weekly alert.
    const { rows } = await db.query(`
      UPDATE twilio_number_pool SET quarantine_alert_sent_at = NOW()
      WHERE id = $1 AND (quarantine_alert_sent_at IS NULL
            OR quarantine_alert_sent_at < NOW() - ($2 || ' days')::interval)
      RETURNING id
    `, [poolRow.id, String(ALERT_COOLDOWN_DAYS)]);
    if (!rows.length || !poolRow.former_contractor_id) return;

    const former = await db.prepare('SELECT * FROM contractors WHERE id = $1').get(poolRow.former_contractor_id);
    if (!former) return;

    let texted = false;
    if (former.phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          to: former.phone,
          from: poolRow.phone_number,
          body: `Heads up: your Tractify subscription ended, but your call forwarding is still on, so your customers' calls are going to a dead line. To turn it off: dial ##61# (AT&T or T-Mobile) or *73 (Verizon), then press call. Questions? support@tractifyhq.com`,
        });
        texted = true;
      } catch (e) {
        console.error('[TWILIO-POOL] Forwarding-still-on SMS failed:', e.message);
      }
    }

    const { sendStripeAlertToJose } = require('./notifications');
    await sendStripeAlertToJose({
      kind: 'forwarding_still_on', contractor: former,
      detail: `A ${channel} from ${from || 'unknown'} reached their quarantined number ${poolRow.phone_number}. ${texted ? 'They were texted how to turn forwarding off.' : 'Could not text them — reach out manually.'} The number stays quarantined until it is quiet for ${QUIET_DAYS_REQUIRED} days.`,
    }).catch(() => {});
  } catch (e) {
    console.error('[TWILIO-POOL] recordQuarantinedContact failed:', e.message);
  }
}

/**
 * Daily sweep (cron.js). For each quarantined number past its hold date:
 *  - quiet for QUIET_DAYS_REQUIRED days → back to 'available' for reuse
 *  - still getting traffic → extend the hold by QUIET_DAYS_REQUIRED days
 *  - quarantined longer than MAX_QUARANTINE_DAYS and still noisy → 'disabled'
 *    (retired — Jose releases it in the Twilio console to stop paying for it)
 * Returns { released, extended, retired }.
 */
async function sweepQuarantinedNumbers() {
  const result = { released: 0, extended: 0, retired: 0 };
  const { rows } = await db.query(`
    SELECT * FROM twilio_number_pool
    WHERE status = 'quarantined' AND quarantined_until < NOW()
  `);

  for (const row of rows) {
    const noisy = row.last_inbound_at &&
      new Date(row.last_inbound_at) > new Date(Date.now() - QUIET_DAYS_REQUIRED * 86400000);
    const tooOld = row.released_at &&
      new Date(row.released_at) < new Date(Date.now() - MAX_QUARANTINE_DAYS * 86400000);

    if (noisy && tooOld) {
      await db.query(`UPDATE twilio_number_pool SET status = 'disabled', release_reason = 'retired_after_quarantine' WHERE id = $1`, [row.id]);
      result.retired++;
      try {
        const former = row.former_contractor_id
          ? await db.prepare('SELECT * FROM contractors WHERE id = $1').get(row.former_contractor_id) : null;
        const { sendStripeAlertToJose } = require('./notifications');
        await sendStripeAlertToJose({
          kind: 'number_retired', contractor: former || { name: 'Former contractor' },
          detail: `${row.phone_number} was still getting calls ${MAX_QUARANTINE_DAYS}+ days after churn, so it was retired from the pool. Release it in the Twilio console if you want to stop paying for it.`,
        });
      } catch (e) { console.error('[TWILIO-POOL] Retire alert failed:', e.message); }
    } else if (noisy) {
      await db.query(`UPDATE twilio_number_pool SET quarantined_until = NOW() + ($1 || ' days')::interval WHERE id = $2`, [String(QUIET_DAYS_REQUIRED), row.id]);
      result.extended++;
    } else {
      await db.query(`
        UPDATE twilio_number_pool
        SET status = 'available', former_contractor_id = NULL, quarantined_until = NULL,
            last_inbound_at = NULL, quarantine_alert_sent_at = NULL, release_reason = 'quarantine_complete'
        WHERE id = $1
      `, [row.id]);
      result.released++;
    }
  }
  return result;
}

/**
 * Mark a contractor's pool number as permanently theirs while they're paying.
 * Removes it from rotation — a converted contractor's number is never released
 * automatically. When their subscription ends it goes into quarantine (see
 * quarantinePoolNumber above), not straight back to 'available'.
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
  // ON CONFLICT DO NOTHING would silently no-op on a duplicate phone number and
  // still hand back the freshly-generated id as if a row had been created —
  // that id wouldn't point at anything real. DO UPDATE SET (a harmless no-op
  // update) with RETURNING id guarantees we always get back the id of whichever
  // row actually exists for this number, new or pre-existing.
  const { rows } = await db.query(`
    INSERT INTO twilio_number_pool (id, phone_number, status)
    VALUES ($1, $2, 'available')
    ON CONFLICT (phone_number) DO UPDATE SET phone_number = EXCLUDED.phone_number
    RETURNING id
  `, [id, phoneNumber]);
  return rows[0].id;
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
  const byStatus = { available: 0, assigned: 0, converted: 0, quarantined: 0, disabled: 0 };
  for (const row of counts) byStatus[row.status] = row.count;
  return { counts: byStatus, numbers: all };
}

module.exports = {
  assignPoolNumber,
  releasePoolNumber,
  quarantinePoolNumber,
  getQuarantinedByNumber,
  recordQuarantinedContact,
  sweepQuarantinedNumbers,
  markPoolNumberConverted,
  addNumberToPool,
  getPoolStats,
};
