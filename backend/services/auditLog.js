/**
 * auditLog.js — Lead event trail
 *
 * Logs every significant thing that happens to a lead so you can trace
 * the full history: matched → link_sent → booked → completed / cancelled / reassigned
 *
 * All calls are fire-and-forget (.catch(() => {})) so a logging failure
 * never takes down the main request.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

/**
 * Log an event for a lead.
 * @param {string} leadId
 * @param {string} eventType  — matched | link_sent | booked | cancelled | completed | reassigned | no_match | reminder_sent
 * @param {string} actor      — 'system' | 'admin' | 'contractor' | 'homeowner'
 * @param {string} [notes]    — optional free-text detail
 */
async function logEvent(leadId, eventType, actor = 'system', notes = null) {
  await db.prepare(
    'INSERT INTO lead_events (id, lead_id, event_type, actor, notes) VALUES ($1, $2, $3, $4, $5)'
  ).run(uuidv4(), leadId, eventType, actor, notes || null)
   .catch(err => console.error(`[auditLog] Failed to log ${eventType} for lead ${leadId}:`, err.message));
}

/**
 * Fetch the full event history for a lead (newest first).
 */
async function getEvents(leadId) {
  return db.prepare(
    'SELECT * FROM lead_events WHERE lead_id = $1 ORDER BY created_at ASC'
  ).all(leadId);
}

module.exports = { logEvent, getEvents };
