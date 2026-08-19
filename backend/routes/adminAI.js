'use strict';

/**
 * POST /api/admin/ai-chat
 *
 * The Tractify admin brain — Jose's command center.
 * Answers questions AND takes action:
 *   - Set Twilio numbers for contractors
 *   - Approve / decline contractor applications
 *   - Assign or reassign leads
 *   - Cancel or delete appointments / leads
 *   - Update contractor details (name, city, phone, etc.)
 *   - Clean up test data
 *
 * Auth: Admin JWT required.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');
const notifications = require('../services/notifications');

// Read CLAUDE.md once at startup (re-read on each request so it's always current)
const CLAUDE_MD_PATH = path.join(__dirname, '../../CLAUDE.md');

// ── Helper: find contractor by partial name ───────────────────────────────────
async function findContractor(nameOrId) {
  // Try exact ID first
  let r = await db.query('SELECT * FROM contractors WHERE id = $1', [nameOrId]);
  if (r.rows.length) return r.rows[0];
  // Try case-insensitive name/company match
  r = await db.query(
    `SELECT * FROM contractors WHERE LOWER(company_name) LIKE $1 OR LOWER(name) LIKE $1 ORDER BY created_at DESC LIMIT 3`,
    [`%${nameOrId.toLowerCase()}%`]
  );
  return r.rows; // caller checks if array or single
}

// POST /api/admin/ai-chat
router.post('/', requireAdmin, async (req, res) => {
  const { message, history = [] } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI not configured — add ANTHROPIC_API_KEY to Railway env vars.' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sevenDaysAgo  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ── Pull all live data in parallel ───────────────────────────────────────
  const [
    contractorsResult,
    bookingsBySourceResult,
    recentBookingsResult,
    allAppointmentsResult,
    allLeadsResult,
    acquisitionSourcesResult,
    brainContextResult,
    contentPerfResult,
  ] = await Promise.all([
    db.query(`
      SELECT
        c.id, c.name, c.company_name, c.email, c.phone, c.city,
        c.is_active, c.status, c.twilio_number, c.booking_slug,
        c.onboarding_steps, c.acquisition_source, c.place_id,
        c.onboarding_started_at, c.created_at,
        COUNT(a.id) FILTER (WHERE a.status != 'cancelled') as total_bookings,
        COUNT(a.id) FILTER (WHERE a.status = 'confirmed' AND a.scheduled_date >= $1) as upcoming_bookings,
        MAX(a.created_at) as last_booking_at
      FROM contractors c
      LEFT JOIN appointments a ON a.contractor_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `, [today]),

    db.query(`
      SELECT
        COALESCE(a.booking_source, 'unknown') as source,
        COUNT(*) as total,
        ROUND(AVG(EXTRACT(epoch FROM (a.created_at - l.created_at)) / 3600), 1) as avg_hours_to_book
      FROM appointments a
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.status != 'cancelled' AND a.created_at >= $1
      GROUP BY COALESCE(a.booking_source, 'unknown')
      ORDER BY avg_hours_to_book ASC NULLS LAST
    `, [thirtyDaysAgo]),

    db.query(`
      SELECT a.id, a.scheduled_date, a.scheduled_time, a.status, a.booking_source, a.created_at,
             c.company_name, c.name as contractor_name,
             l.name as lead_name, l.phone as lead_phone, l.zip_code
      FROM appointments a
      JOIN contractors c ON a.contractor_id = c.id
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.created_at >= $1 AND a.status != 'cancelled'
      ORDER BY a.created_at DESC LIMIT 20
    `, [sevenDaysAgo]),

    db.query(`
      SELECT c.id, c.company_name, c.name as contractor_name, c.city, c.acquisition_source,
             COUNT(a.id) FILTER (WHERE a.status = 'confirmed') as confirmed,
             COUNT(a.id) FILTER (WHERE a.status = 'completed') as completed,
             COUNT(a.id) FILTER (WHERE a.status = 'cancelled') as cancelled,
             COUNT(a.id) FILTER (WHERE a.status != 'cancelled') as total
      FROM contractors c
      LEFT JOIN appointments a ON a.contractor_id = c.id
      WHERE c.is_active = 1
      GROUP BY c.id, c.company_name, c.name, c.city, c.acquisition_source
      ORDER BY total DESC
    `),

    db.query(`SELECT status, COUNT(*) as count FROM leads WHERE created_at >= $1 GROUP BY status`, [thirtyDaysAgo]),

    db.query(`
      SELECT COALESCE(acquisition_source, 'direct/unknown') as source,
             COUNT(*) as contractors, COUNT(*) FILTER (WHERE is_active = 1) as active
      FROM contractors GROUP BY COALESCE(acquisition_source, 'direct/unknown') ORDER BY contractors DESC
    `),

    db.query(`
      SELECT id, type, summary, detail, created_at
      FROM brain_context
      ORDER BY created_at DESC
      LIMIT 100
    `),

    // Content performance: which ?src= tag drove signups that actually produced bookings?
    // Cross-references acquisition_source (how contractor found us) with their booking results.
    db.query(`
      SELECT
        COALESCE(c.acquisition_source, 'direct/unknown') as source,
        COUNT(DISTINCT c.id) as signups,
        COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = 1) as active,
        COALESCE(SUM(a.bookings), 0) as total_bookings,
        ROUND(AVG(COALESCE(a.bookings, 0)), 1) as avg_bookings_per_contractor,
        MIN(c.created_at::date) as first_signup_date,
        MAX(c.created_at::date) as last_signup_date
      FROM contractors c
      LEFT JOIN (
        SELECT contractor_id, COUNT(*) FILTER (WHERE status != 'cancelled') as bookings
        FROM appointments GROUP BY contractor_id
      ) a ON a.contractor_id = c.id
      GROUP BY COALESCE(c.acquisition_source, 'direct/unknown')
      ORDER BY total_bookings DESC, signups DESC
    `),
  ]);

  const contractors = contractorsResult.rows;
  const bookingsBySource = bookingsBySourceResult.rows;
  const recentBookings = recentBookingsResult.rows;
  const apptsByContractor = allAppointmentsResult.rows;
  const leadStatuses = allLeadsResult.rows;
  const acqSources = acquisitionSourcesResult.rows;
  const brainLog = brainContextResult.rows;
  const contentPerf = contentPerfResult.rows;

  // ── Build context strings ─────────────────────────────────────────────────
  const CHECKLIST_KEYS = ['availability', 'twilio', 'gbp', 'nextdoor', 'facebook', 'reviewers', 'messenger'];
  function parseSteps(s) { try { return typeof s === 'string' ? JSON.parse(s || '{}') : (s || {}); } catch { return {}; } }
  function stepsCompleted(s) { const p = parseSteps(s); return CHECKLIST_KEYS.filter(k => p[k]).length; }
  function daysSince(d) { if (!d) return null; return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

  const activeContractors  = contractors.filter(c => c.is_active == 1);
  const pendingContractors = contractors.filter(c => !c.is_active && !c.declined_at);
  const totalBookings      = contractors.reduce((s, c) => s + parseInt(c.total_bookings || 0), 0);

  const contractorLines = contractors.map(c => {
    const steps = stepsCompleted(c.onboarding_steps);
    const src = c.acquisition_source ? ` [src: ${c.acquisition_source}]` : '';
    const city = c.city ? ` (${c.city})` : '';
    const status = c.is_active == 1 ? 'ACTIVE' : 'PENDING';
    const twilio = c.twilio_number ? ` | Twilio: ${c.twilio_number}` : ' | No Twilio';
    return `  [ID: ${c.id}] ${status} | ${c.company_name || c.name}${city}${src} | ${steps}/7 steps | ${c.total_bookings || 0} bookings${twilio} | deployed ${daysSince(c.created_at)}d ago`;
  });

  const stalledContractors = activeContractors.filter(c => {
    const steps = stepsCompleted(c.onboarding_steps);
    const daysSinceLastBook = c.last_booking_at ? daysSince(c.last_booking_at) : 9999;
    return steps < 4 || (daysSinceLastBook > 5 && parseInt(c.total_bookings || 0) === 0);
  });

  // Load full CLAUDE.md on every request so the brain always has the latest context
  let claudeMd = '';
  try {
    claudeMd = fs.readFileSync(CLAUDE_MD_PATH, 'utf8');
  } catch (e) {
    console.warn('[ADMIN-AI] Could not read CLAUDE.md:', e.message);
  }

  // Split into two parts for prompt caching:
  // Part 1 (static — cached): CLAUDE.md rarely changes → 90% cost reduction on repeat reads
  // Part 2 (dynamic — not cached): live DB data changes every query
  const staticSystemPrompt = `You are the Tractify admin brain — Jose's command center. You have full context of the entire business (strategy, build history, decisions, priorities) from the master context document below, PLUS live real-time data from the database. You can BOTH answer questions AND take real actions in the system.

=== TRACTIFY MASTER CONTEXT (CLAUDE.md — full business context) ===
${claudeMd}
=== END MASTER CONTEXT ===`;

  const dynamicSystemPrompt = `=== LIVE DATABASE SNAPSHOT (pulled now, always current) ===
TODAY: ${today}
ACTIVE CONTRACTORS: ${activeContractors.length} | PENDING: ${pendingContractors.length} | TOTAL BOOKINGS: ${totalBookings}

=== ALL CONTRACTORS (with IDs for actions) ===
${contractorLines.join('\n') || '  None yet'}

=== STALLED / AT-RISK ===
${stalledContractors.length ? stalledContractors.map(c => `  ⚠️  [${c.id}] ${c.company_name || c.name}: ${stepsCompleted(c.onboarding_steps)}/7 steps, ${c.total_bookings || 0} bookings, live ${daysSince(c.created_at)}d`).join('\n') : '  None'}

=== BOOKING CHANNELS (last 30d, fastest first) ===
${bookingsBySource.map(r => `  ${r.source}: ${r.total} bookings${r.avg_hours_to_book ? `, avg ${r.avg_hours_to_book}h` : ''}`).join('\n') || '  No data yet'}

=== RECENT BOOKINGS (last 7d) ===
${recentBookings.map(b => `  [${b.id}] ${b.company_name || b.contractor_name} — ${b.lead_name || 'direct'} | ${b.scheduled_date} | src: ${b.booking_source || 'unknown'}`).join('\n') || '  None'}

=== ALL-TIME BY CONTRACTOR ===
${apptsByContractor.map(r => `  [${r.id}] ${r.company_name || r.contractor_name}: ${r.total} total | ${r.confirmed} confirmed | ${r.completed} completed`).join('\n') || '  None'}

=== ACQUISITION SOURCES ===
${acqSources.map(r => `  ${r.source}: ${r.contractors} signed up, ${r.active} active`).join('\n') || '  None — tag intake URLs with ?src='}

=== CONTENT PERFORMANCE (which ?src= tag produced actual bookings, not just signups) ===
${contentPerf.length
  ? contentPerf.map(r => {
      const convRate = r.signups > 0 ? Math.round((r.active / r.signups) * 100) : 0;
      return `  ${r.source}: ${r.signups} signups → ${r.active} active (${convRate}% conv) | ${r.total_bookings} total bookings | avg ${r.avg_bookings_per_contractor} bookings/contractor | ${r.first_signup_date}–${r.last_signup_date}`;
    }).join('\n')
  : '  No data yet — start tagging intake URLs with ?src=[platform]_[format]_[hook]_[month] per the Content Brain playbook'}
NOTE: "signups" = filled intake form. "active" = is_active=1 contractors. "total_bookings" = confirmed+completed appointments. High signup/low booking = creative attracts the wrong contractors. High booking/low signup = your best creative — scale it.

=== LEAD STATUS (last 30d) ===
${leadStatuses.map(r => `  ${r.status}: ${r.count}`).join('\n') || '  None'}

=== BRAIN MEMORY LOG (decisions + insights you or Jose recorded) ===
${brainLog.length
  ? brainLog.map(r => `  [${new Date(r.created_at).toISOString().slice(0,10)}] [${r.type.toUpperCase()}] ${r.summary}${r.detail ? '\n    → ' + r.detail : ''}`).join('\n')
  : '  Empty — log decisions with log_decision tool so they persist across sessions'}
=== END BRAIN MEMORY LOG ===

=== WHAT YOU CAN DO ===
- Answer any question about the business using all context above
- Set Twilio numbers for contractors (use set_twilio_number)
- Approve or decline pending contractor applications (approve_contractor / decline_contractor)
- Update contractor info: city, phone, company name, etc. (update_contractor)
- Assign or reassign leads to a contractor (assign_lead)
- Cancel appointments (cancel_appointment)
- Delete cancelled appointments or test leads (delete_appointment / delete_lead)
- Log a decision, insight, or note to persistent memory (log_decision) — use this proactively whenever something important is decided or learned

IMPORTANT: Use log_decision proactively. Any time a real decision is made, a pattern is noticed, or a strategic call is confirmed — log it. This is how the brain builds memory across sessions. Examples:
- "Approved Evergreen for $20/day ad spend — 4.8 stars, 90 reviews, strong Seattle market"
- "Decided to prioritize contractors with 50+ Google reviews for ad spend"
- "Missed call text-back converting at ~40% — highest of all channels so far"

When Jose asks you to do something, confirm what you did with the exact result.
When identifying contractors by name, use the IDs from the list above.
Be direct. No fluff. Jose is running a business.`;

  // Build system prompt array for prompt caching
  // Anthropic caches the static part (CLAUDE.md) at 90% discount after first read
  // Cache TTL is 5 minutes — within any active session, most reads hit cache
  const systemBlocks = [
    { type: 'text', text: staticSystemPrompt, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicSystemPrompt },
  ];

  // ── Tool definitions ──────────────────────────────────────────────────────
  const tools = [
    {
      name: 'set_twilio_number',
      description: 'Set or update the Twilio phone number for a contractor. Use when Jose says "set Twilio for [contractor]" or "assign [number] to [contractor]".',
      input_schema: {
        type: 'object',
        properties: {
          contractor_id: { type: 'string', description: 'Contractor UUID from the list above' },
          twilio_number: { type: 'string', description: 'E.164 format e.g. +12065551234. Pass empty string to clear.' },
        },
        required: ['contractor_id', 'twilio_number'],
      },
    },
    {
      name: 'approve_contractor',
      description: 'Approve a pending contractor application, making them active and allowing them to log in.',
      input_schema: {
        type: 'object',
        properties: {
          contractor_id: { type: 'string', description: 'Contractor UUID to approve' },
        },
        required: ['contractor_id'],
      },
    },
    {
      name: 'decline_contractor',
      description: 'Decline a pending contractor application.',
      input_schema: {
        type: 'object',
        properties: {
          contractor_id: { type: 'string', description: 'Contractor UUID to decline' },
        },
        required: ['contractor_id'],
      },
    },
    {
      name: 'update_contractor',
      description: 'Update a contractor field: city, phone, company_name, name, acquisition_source, twilio_number, or business_phone (the public number customers call, when different from their personal cell).',
      input_schema: {
        type: 'object',
        properties: {
          contractor_id: { type: 'string', description: 'Contractor UUID' },
          field: { type: 'string', enum: ['city', 'phone', 'company_name', 'name', 'acquisition_source', 'twilio_number', 'business_phone'], description: 'Field to update' },
          value: { type: 'string', description: 'New value for the field' },
        },
        required: ['contractor_id', 'field', 'value'],
      },
    },
    {
      name: 'assign_lead',
      description: 'Assign or reassign a lead to a specific contractor.',
      input_schema: {
        type: 'object',
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID' },
          contractor_id: { type: 'string', description: 'Contractor UUID to assign lead to' },
        },
        required: ['lead_id', 'contractor_id'],
      },
    },
    {
      name: 'cancel_appointment',
      description: 'Cancel a booked appointment. Homeowner gets a rebook link.',
      input_schema: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment UUID from the list above' },
        },
        required: ['appointment_id'],
      },
    },
    {
      name: 'delete_appointment',
      description: 'Permanently delete a cancelled or completed appointment. Use for cleaning up test data.',
      input_schema: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment UUID to delete. Must be cancelled or completed status.' },
        },
        required: ['appointment_id'],
      },
    },
    {
      name: 'delete_lead',
      description: 'Permanently delete a lead and all its associated data. Use for cleaning up test leads.',
      input_schema: {
        type: 'object',
        properties: {
          lead_id: { type: 'string', description: 'Lead UUID to delete' },
        },
        required: ['lead_id'],
      },
    },
    {
      name: 'log_decision',
      description: 'Write a decision, insight, or important note to persistent brain memory. This survives across sessions and is injected into every future brain query. Use proactively whenever a real decision is made or a pattern is noticed.',
      input_schema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['decision', 'insight', 'strategy', 'note', 'result'],
            description: 'Type of entry. decision = a call that was made. insight = a pattern noticed. strategy = a strategic direction set. result = outcome of an action. note = anything else worth remembering.',
          },
          summary: { type: 'string', description: 'One-line summary (shown in the log). Keep it tight and specific — e.g. "Approved Evergreen for $20/day ad spend — 4.8 stars, strong Seattle market"' },
          detail: { type: 'string', description: 'Optional extra context, reasoning, or data behind the entry.' },
        },
        required: ['type', 'summary'],
      },
    },
  ];

  // ── Call Claude ───────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages = [...history.slice(-12), { role: 'user', content: message }];
  const toolMessages = [...messages];

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemBlocks,
    tools,
    messages,
  }, { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } });

  // ── Tool execution loop ───────────────────────────────────────────────────
  let actionTaken = null;

  while (response.stop_reason === 'tool_use') {
    const toolUseBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolUseBlock) break;

    const { name, id: toolUseId, input } = toolUseBlock;
    let toolResult;

    try {
      if (name === 'set_twilio_number') {
        const { contractor_id, twilio_number } = input;
        const check = await db.query('SELECT company_name, name FROM contractors WHERE id = $1', [contractor_id]);
        if (!check.rows.length) { toolResult = 'Contractor not found.'; }
        else {
          await db.query('UPDATE contractors SET twilio_number = $1 WHERE id = $2', [twilio_number || null, contractor_id]);
          const cName = check.rows[0].company_name || check.rows[0].name;
          toolResult = `Twilio number ${twilio_number ? `set to ${twilio_number}` : 'cleared'} for ${cName}.`;
          actionTaken = { type: 'set_twilio_number', contractor_id };
          console.log(`[ADMIN-AI] Set Twilio ${twilio_number} → ${cName}`);
        }

      } else if (name === 'approve_contractor') {
        const check = await db.query('SELECT * FROM contractors WHERE id = $1', [input.contractor_id]);
        if (!check.rows.length) { toolResult = 'Contractor not found.'; }
        else {
          await db.query(`UPDATE contractors SET is_active = 1, status = 'approved' WHERE id = $1`, [input.contractor_id]);
          const c = check.rows[0];
          notifications.sendContractorApproved(c).catch(console.error);
          toolResult = `Approved ${c.company_name || c.name}. They can now log in and approval email sent.`;
          actionTaken = { type: 'approve_contractor', contractor_id: input.contractor_id };
          console.log(`[ADMIN-AI] Approved contractor ${c.company_name || c.name}`);
        }

      } else if (name === 'decline_contractor') {
        const check = await db.query('SELECT * FROM contractors WHERE id = $1', [input.contractor_id]);
        if (!check.rows.length) { toolResult = 'Contractor not found.'; }
        else {
          await db.query(`UPDATE contractors SET is_active = 0, declined_at = NOW() WHERE id = $1`, [input.contractor_id]);
          const c = check.rows[0];
          require('../services/twilioPool').releasePoolNumber(input.contractor_id, 'declined').catch(console.error);
          notifications.sendContractorDeclined(c).catch(console.error);
          toolResult = `Declined ${c.company_name || c.name}. Decline email sent.`;
          actionTaken = { type: 'decline_contractor', contractor_id: input.contractor_id };
        }

      } else if (name === 'update_contractor') {
        const { contractor_id, field, value } = input;
        const allowed = ['city', 'phone', 'company_name', 'name', 'acquisition_source', 'twilio_number', 'business_phone'];
        if (!allowed.includes(field)) { toolResult = `Cannot update field "${field}". Allowed: ${allowed.join(', ')}`; }
        else {
          const check = await db.query('SELECT company_name, name FROM contractors WHERE id = $1', [contractor_id]);
          if (!check.rows.length) { toolResult = 'Contractor not found.'; }
          else {
            await db.query(`UPDATE contractors SET ${field} = $1 WHERE id = $2`, [value, contractor_id]);
            const cName = check.rows[0].company_name || check.rows[0].name;
            toolResult = `Updated ${cName}: ${field} = "${value}"`;
            actionTaken = { type: 'update_contractor', contractor_id, field, value };
            console.log(`[ADMIN-AI] Updated ${cName}.${field} = "${value}"`);
          }
        }

      } else if (name === 'assign_lead') {
        const { lead_id, contractor_id } = input;
        const [leadCheck, contractorCheck] = await Promise.all([
          db.query('SELECT name FROM leads WHERE id = $1', [lead_id]),
          db.query('SELECT company_name, name FROM contractors WHERE id = $1', [contractor_id]),
        ]);
        if (!leadCheck.rows.length) { toolResult = 'Lead not found.'; }
        else if (!contractorCheck.rows.length) { toolResult = 'Contractor not found.'; }
        else {
          await db.query(`UPDATE leads SET assigned_contractor_id = $1, status = 'matched' WHERE id = $2`, [contractor_id, lead_id]);
          const lName = leadCheck.rows[0].name;
          const cName = contractorCheck.rows[0].company_name || contractorCheck.rows[0].name;
          toolResult = `Lead "${lName}" assigned to ${cName}.`;
          actionTaken = { type: 'assign_lead', lead_id, contractor_id };
          console.log(`[ADMIN-AI] Assigned lead ${lead_id} → ${cName}`);
        }

      } else if (name === 'cancel_appointment') {
        const appt = await db.query(
          `SELECT a.*, l.name as lead_name, l.email as lead_email, l.phone as lead_phone, c.company_name
           FROM appointments a LEFT JOIN leads l ON a.lead_id = l.id JOIN contractors c ON a.contractor_id = c.id
           WHERE a.id = $1`,
          [input.appointment_id]
        );
        if (!appt.rows.length) { toolResult = 'Appointment not found.'; }
        else {
          const a = appt.rows[0];
          await db.query(`UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [input.appointment_id]);
          toolResult = `Cancelled appointment on ${a.scheduled_date} at ${a.scheduled_time} for ${a.company_name}.${a.lead_email ? ' Homeowner notified.' : ''}`;
          actionTaken = { type: 'cancel_appointment', appointment_id: input.appointment_id };
          console.log(`[ADMIN-AI] Cancelled appointment ${input.appointment_id}`);
        }

      } else if (name === 'delete_appointment') {
        const appt = await db.query('SELECT status FROM appointments WHERE id = $1', [input.appointment_id]);
        if (!appt.rows.length) { toolResult = 'Appointment not found.'; }
        else if (!['cancelled', 'completed', 'external'].includes(appt.rows[0].status)) {
          toolResult = `Cannot delete — appointment status is "${appt.rows[0].status}". Cancel it first.`;
        } else {
          await db.query('DELETE FROM appointments WHERE id = $1', [input.appointment_id]);
          toolResult = `Appointment ${input.appointment_id} permanently deleted.`;
          actionTaken = { type: 'delete_appointment', appointment_id: input.appointment_id };
          console.log(`[ADMIN-AI] Deleted appointment ${input.appointment_id}`);
        }

      } else if (name === 'delete_lead') {
        const lead = await db.query('SELECT name FROM leads WHERE id = $1', [input.lead_id]);
        if (!lead.rows.length) { toolResult = 'Lead not found.'; }
        else {
          // Delete related records first
          await db.query('DELETE FROM booking_tokens WHERE lead_id = $1', [input.lead_id]);
          await db.query('DELETE FROM lead_events WHERE lead_id = $1', [input.lead_id]);
          await db.query('UPDATE appointments SET lead_id = NULL WHERE lead_id = $1', [input.lead_id]);
          await db.query('DELETE FROM leads WHERE id = $1', [input.lead_id]);
          toolResult = `Lead "${lead.rows[0].name}" (${input.lead_id}) permanently deleted.`;
          actionTaken = { type: 'delete_lead', lead_id: input.lead_id };
          console.log(`[ADMIN-AI] Deleted lead ${input.lead_id}`);
        }

      } else if (name === 'log_decision') {
        const { type: entryType, summary, detail } = input;
        await db.query(
          'INSERT INTO brain_context (type, summary, detail) VALUES ($1, $2, $3)',
          [entryType, summary, detail || null]
        );
        toolResult = `Logged to brain memory: [${entryType.toUpperCase()}] ${summary}`;
        actionTaken = { type: 'log_decision', entry_type: entryType };
        console.log(`[ADMIN-AI] Brain memory logged: [${entryType}] ${summary}`);

      } else {
        toolResult = `Unknown tool: ${name}`;
      }
    } catch (err) {
      toolResult = `Error: ${err.message}`;
      console.error(`[ADMIN-AI] Tool ${name} error:`, err.message);
    }

    // Continue with tool result
    toolMessages.push({ role: 'assistant', content: response.content });
    toolMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: toolResult }] });

    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemBlocks,
      tools,
      messages: toolMessages,
    }, { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } });
  }

  const reply = response.content.find(b => b.type === 'text')?.text || "Couldn't process that. Try rephrasing.";
  console.log(`[ADMIN-AI] "${message.slice(0, 60)}…" → ${reply.length} chars${actionTaken ? ` | ACTION: ${actionTaken.type}` : ''}`);

  res.json({ reply, action: actionTaken });
});

module.exports = router;
