'use strict';

/**
 * POST /api/admin/ai-chat
 *
 * The Tractify admin brain — Jose's real-time business intelligence layer.
 * Pulls live data from the DB and answers plain-language questions about:
 *   - Which contractors are set up, stalled, or converting fast
 *   - Which channels are delivering jobs and which are dead weight
 *   - Which acquisition sources (ads/videos) are driving contractor signups
 *   - Where to spend money, what's working, what needs fixing
 *   - Day-to-day decisions backed by actual data
 *
 * Auth: Admin JWT required.
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
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
  ] = await Promise.all([
    // All contractors — status, checklist, acquisition source, city
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

    // Bookings grouped by source — conversion speed + volume
    db.query(`
      SELECT
        COALESCE(a.booking_source, 'unknown') as source,
        COUNT(*) as total,
        ROUND(AVG(EXTRACT(epoch FROM (a.created_at - l.created_at)) / 3600), 1) as avg_hours_to_book
      FROM appointments a
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.status != 'cancelled'
        AND a.created_at >= $1
      GROUP BY COALESCE(a.booking_source, 'unknown')
      ORDER BY avg_hours_to_book ASC NULLS LAST
    `, [thirtyDaysAgo]),

    // Recent bookings — last 7 days, with contractor name
    db.query(`
      SELECT
        a.id, a.scheduled_date, a.scheduled_time, a.status, a.booking_source,
        a.created_at,
        c.company_name, c.name as contractor_name,
        l.name as lead_name, l.phone as lead_phone, l.zip_code
      FROM appointments a
      JOIN contractors c ON a.contractor_id = c.id
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.created_at >= $1
        AND a.status != 'cancelled'
      ORDER BY a.created_at DESC
      LIMIT 20
    `, [sevenDaysAgo]),

    // All-time appointment totals by contractor + status
    db.query(`
      SELECT
        c.company_name, c.name as contractor_name, c.city, c.acquisition_source,
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

    // All leads — status breakdown
    db.query(`
      SELECT
        status, COUNT(*) as count
      FROM leads
      WHERE created_at >= $1
      GROUP BY status
    `, [thirtyDaysAgo]),

    // Contractor acquisition sources — which ads/videos drove signups
    db.query(`
      SELECT
        COALESCE(acquisition_source, 'direct/unknown') as source,
        COUNT(*) as contractors,
        COUNT(*) FILTER (WHERE is_active = 1) as active,
        SUM(
          CASE WHEN onboarding_steps IS NOT NULL
               THEN (SELECT COUNT(*) FROM jsonb_object_keys(onboarding_steps))
               ELSE 0
          END
        ) as total_steps_completed
      FROM contractors
      GROUP BY COALESCE(acquisition_source, 'direct/unknown')
      ORDER BY contractors DESC
    `),
  ]);

  const contractors = contractorsResult.rows;
  const bookingsBySource = bookingsBySourceResult.rows;
  const recentBookings = recentBookingsResult.rows;
  const apptsByContractor = allAppointmentsResult.rows;
  const leadStatuses = allLeadsResult.rows;
  const acqSources = acquisitionSourcesResult.rows;

  // ── Build rich context strings ────────────────────────────────────────────
  const CHECKLIST_KEYS = ['availability', 'twilio', 'gbp', 'nextdoor', 'facebook', 'reviewers', 'messenger'];

  function parseSteps(steps) {
    if (!steps) return {};
    if (typeof steps === 'string') {
      try { return JSON.parse(steps); } catch { return {}; }
    }
    return steps;
  }

  function stepsCompleted(steps) {
    const parsed = parseSteps(steps);
    return CHECKLIST_KEYS.filter(k => parsed[k]).length;
  }

  function daysSince(dateStr) {
    if (!dateStr) return null;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // Contractor summary
  const activeContractors  = contractors.filter(c => c.is_active == 1);
  const pendingContractors = contractors.filter(c => !c.is_active && !c.declined_at);
  const totalBookings      = contractors.reduce((s, c) => s + parseInt(c.total_bookings || 0), 0);

  const contractorLines = contractors.map(c => {
    const steps = stepsCompleted(c.onboarding_steps);
    const daysOld = daysSince(c.created_at);
    const lastBook = c.last_booking_at ? `last booking ${daysSince(c.last_booking_at)}d ago` : 'no bookings yet';
    const src = c.acquisition_source ? ` [src: ${c.acquisition_source}]` : '';
    const city = c.city ? ` (${c.city})` : '';
    const status = c.is_active == 1 ? 'ACTIVE' : 'PENDING';
    return `  ${status} | ${c.company_name || c.name}${city}${src} | ${steps}/7 setup steps | ${c.total_bookings || 0} bookings | ${lastBook} | deployed ${daysOld}d ago`;
  });

  const channelLines = bookingsBySource.length
    ? bookingsBySource.map(r =>
        `  ${r.source}: ${r.total} bookings${r.avg_hours_to_book ? `, avg ${r.avg_hours_to_book}h to book` : ''}`
      )
    : ['  No booking data yet'];

  const recentLines = recentBookings.length
    ? recentBookings.map(b => {
        const src = b.booking_source ? ` [${b.booking_source}]` : '';
        const bookedFor = b.lead_name ? ` — ${b.lead_name}` : '';
        const daysSinceBooked = daysSince(b.created_at);
        return `  ${b.company_name || b.contractor_name}${bookedFor}${src} — ${b.scheduled_date} (booked ${daysSinceBooked}d ago)`;
      })
    : ['  No bookings in the last 7 days'];

  const apptLines = apptsByContractor
    .filter(r => r.total > 0 || r.confirmed > 0)
    .map(r => {
      const src = r.acquisition_source ? ` [acquired via: ${r.acquisition_source}]` : '';
      const city = r.city ? ` (${r.city})` : '';
      return `  ${r.company_name || r.contractor_name}${city}${src}: ${r.total} total | ${r.confirmed} confirmed | ${r.completed} completed | ${r.cancelled} cancelled`;
    });

  const acqLines = acqSources.map(r =>
    `  ${r.source}: ${r.contractors} contractors signed up | ${r.active} active | ${r.total_steps_completed} total setup steps completed`
  );

  const leadStatusLines = leadStatuses.map(r => `  ${r.status}: ${r.count} leads`);

  // Stalled contractors (active, low setup steps, no recent bookings)
  const stalledContractors = activeContractors.filter(c => {
    const steps = stepsCompleted(c.onboarding_steps);
    const daysSinceLastBook = c.last_booking_at ? daysSince(c.last_booking_at) : 9999;
    return steps < 4 || (daysSinceLastBook > 5 && parseInt(c.total_bookings || 0) === 0);
  });

  const stalledLines = stalledContractors.length
    ? stalledContractors.map(c => {
        const steps = stepsCompleted(c.onboarding_steps);
        const daysLive = daysSince(c.created_at);
        return `  ⚠️  ${c.company_name || c.name}: ${steps}/7 setup steps complete, ${c.total_bookings || 0} bookings, live for ${daysLive} days`;
      })
    : ['  None — all active contractors are progressing'];

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemPrompt = `You are the Tractify admin brain — Jose's real-time business intelligence layer. You have full visibility into the entire business: every contractor, every booking, every channel, every acquisition source.

TODAY: ${today}
TOTAL ACTIVE CONTRACTORS: ${activeContractors.length}
PENDING APPLICATIONS: ${pendingContractors.length}
TOTAL BOOKINGS (all time): ${totalBookings}

=== CONTRACTORS (all, newest first) ===
${contractorLines.join('\n') || '  No contractors yet'}

=== STALLED / AT-RISK CONTRACTORS ===
${stalledLines.join('\n')}

=== BOOKING CHANNEL PERFORMANCE (last 30 days) ===
(sorted by conversion speed — fastest first)
${channelLines.join('\n')}

=== RECENT BOOKINGS (last 7 days) ===
${recentLines.join('\n')}

=== ALL-TIME BOOKINGS BY CONTRACTOR ===
${apptLines.join('\n') || '  No confirmed bookings yet'}

=== CONTRACTOR ACQUISITION SOURCES (which ads/content drove signups) ===
${acqLines.join('\n') || '  No acquisition data yet — tag intake URLs with ?src= to track'}

=== LEAD STATUS BREAKDOWN (last 30 days) ===
${leadStatusLines.join('\n') || '  No leads yet'}

=== HOW TRACTIFY WORKS (your context) ===
- Contractors sign up via intake.tractifyhq.com — their site auto-deploys to a subdomain
- Free trial: 5 booked jobs delivered. At job 5, Stripe fires → $2,000 setup + $800/month retainer
- 10 channels drive homeowner bookings to each contractor: Google Search, Bing, Facebook ads, Facebook Lead Ads, Nextdoor, Google Business Profile, missed call text-back, inbound SMS, Facebook groups, Google reviewers
- booking_source tags every booking with which channel drove it — this is how you know what's working
- acquisition_source tags each contractor with which content/ad drove their signup — ?src= URL param on intake.tractifyhq.com
- Checklist has 7 steps: availability, twilio, gbp, nextdoor, facebook, reviewers, messenger
- Twilio is the blocker for missed call text-back and AI SMS — compliance is pending (EIN too new)
- Target: contractors with strong Google presence (4.5+ rating, 50+ reviews) convert fastest

=== YOUR ROLE ===
Answer Jose's questions with concrete data from above. Be direct and data-first.
Examples of what you help with:
- "Which contractors should I put ad spend behind this week?" → Look at setup completion, booking velocity, channel data
- "Why is [contractor] getting zero bookings?" → Check their setup steps, stalled flag, channel activity
- "Which channels are converting fastest?" → Channel performance table above
- "Which ad drove the most signups?" → Acquisition sources above
- "How close am I to my first Stripe conversion?" → Track booking counts per contractor toward 5
- "What should I do today?" → Identify the highest-leverage action from the data

Be concise but data-rich. When the data doesn't exist yet (e.g., no bookings to compare channels), say so clearly and say what needs to happen for that data to exist. Don't pad answers — Jose is building a business, not reading a report.`;

  // ── Call Claude ───────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages = [
    ...history.slice(-12),
    { role: 'user', content: message },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const reply = response.content.find(b => b.type === 'text')?.text
    || "Couldn't process that. Try rephrasing.";

  console.log(`[ADMIN-AI] Query from admin: "${message.slice(0, 80)}..." → ${reply.length} chars`);

  res.json({ reply });
});

module.exports = router;
