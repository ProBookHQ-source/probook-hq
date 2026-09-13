'use strict';

/**
 * Shared error-logging helper — added session 34 (Sept 2026) to close the
 * biggest remaining gap in the admin brain's visibility: application-level
 * errors that get caught and swallowed (console.error only) never reached
 * the database, so the brain had no way to see when something almost broke.
 *
 * Deliberately scoped to the SMS-critical paths (smsAI.js, homeownerSmsAI.js,
 * twilio.js, bookings.js) — not a blanket logger for the whole app's ~245
 * catch blocks. Those four files are where live contractor/homeowner
 * conversations actually run.
 *
 * Fails silently on its own errors — logging a bug must never be the reason
 * a real SMS reply doesn't go out. Every call site should treat this exactly
 * like the console.error it's usually placed next to: fire and forget.
 */

const db = require('../database/db');

/**
 * @param {string} source - which file/function this came from, e.g. 'homeownerSmsAI.handleSlotPick'
 * @param {Error|string} err - the error object or a plain message
 * @param {object} [opts]
 * @param {string} [opts.contractorId]
 * @param {string} [opts.phone]
 * @param {object} [opts.context] - any extra structured detail (session state, input text, etc.)
 */
async function logError(source, err, opts = {}) {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : null;
    await db.query(
      `INSERT INTO error_log (source, message, stack, contractor_id, phone, context)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        source,
        message,
        stack,
        opts.contractorId || null,
        opts.phone || null,
        opts.context ? JSON.stringify(opts.context) : null,
      ]
    );
  } catch (loggingErr) {
    // Never let logging itself throw or block the real request.
    console.error('[ERROR-LOG] Failed to persist error log entry:', loggingErr.message);
  }
}

module.exports = { logError };
