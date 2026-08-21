const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireContractor } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const notifications = require('../services/notifications');
const { logEvent } = require('../services/auditLog');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// POST /api/contractor/ai-chat
router.post('/', requireContractor, async (req, res) => {
  const { message, history = [] } = req.body;
  const contractorId = req.user.id;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI assistant not configured — add ANTHROPIC_API_KEY to Railway env vars.' });
  }

  // ── Gather context ────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [contractorResult, appointmentsResult, slotsResult] = await Promise.all([
    db.query('SELECT id, name, company_name, phone, booking_slug, twilio_number, onboarding_steps, place_id FROM contractors WHERE id = $1', [contractorId]),
    db.query(
      `SELECT a.id, a.scheduled_date, a.scheduled_time, a.duration_minutes, a.status, a.notes,
              l.name as lead_name, l.phone as lead_phone, l.email as lead_email
       FROM appointments a
       LEFT JOIN leads l ON a.lead_id = l.id
       WHERE a.contractor_id = $1
         AND a.scheduled_date >= $2
         AND a.scheduled_date <= $3
         AND a.status NOT IN ('cancelled')
       ORDER BY a.scheduled_date, a.scheduled_time`,
      [contractorId, today, twoWeeksOut]
    ),
    db.query(
      'SELECT * FROM availability_slots WHERE contractor_id = $1 ORDER BY day_of_week',
      [contractorId]
    ),
  ]);

  const contractor = contractorResult.rows[0];
  if (!contractor) return res.status(404).json({ error: 'Contractor not found' });

  const appointments = appointmentsResult.rows;
  const slots = slotsResult.rows;

  // ── Build system prompt ───────────────────────────────────────────────────
  const scheduleText = slots.length
    ? slots.map(s => `  ${DAYS[s.day_of_week]}: ${fmtTime(s.start_time)} – ${fmtTime(s.end_time)}`).join('\n')
    : '  No regular schedule set yet';

  const apptText = appointments.length
    ? appointments.map(a => {
        const name = a.lead_name || (a.notes?.includes('block') ? 'Blocked time' : 'Direct booking');
        const phone = a.lead_phone ? ` | ${a.lead_phone}` : '';
        const date = new Date(a.scheduled_date + 'T12:00:00');
        const dayName = DAYS[date.getDay()];
        return `  [ID: ${a.id}] ${dayName} ${a.scheduled_date} at ${fmtTime(a.scheduled_time)} — ${name}${phone} (${a.status})`;
      }).join('\n')
    : '  No upcoming appointments in the next 14 days';

  const todayDayName = DAYS[new Date().getDay()];

  // ── Checklist context ─────────────────────────────────────────────────────
  const completedSteps = typeof contractor.onboarding_steps === 'string'
    ? JSON.parse(contractor.onboarding_steps || '{}')
    : (contractor.onboarding_steps || {});

  const bookingLink = contractor.booking_slug
    ? `https://tractifyhq.com/schedule/${contractor.booking_slug}`
    : 'https://tractifyhq.com/schedule/[their-slug]';

  const twilioNumber = contractor.twilio_number || '(not assigned yet — will be in their welcome email)';

  const STEP_DETAILS = {
    service_area: {
      label: 'Confirm your service area',
      done: !!completedSteps.service_area,
      guide: `Ask them to list every zip code they service, separated by commas or spaces (example: "98004, 98005, 98052"). Once they give you real zip codes, call set_service_zip_codes with the list — do not guess zip codes yourself. If they don't know their exact zips, ask them to list the zip codes they're comfortable driving to. Only call set_service_zip_codes with no_limit=true if they explicitly say they have no limit and will go anywhere — never assume that.`,
    },
    availability: {
      label: 'Confirm your availability',
      done: !!completedSteps.availability,
      guide: 'Ask them to click "My Schedule" in the sidebar. Their hours were pre-set from their intake form — they just need to confirm they look right and adjust if needed. Once they\'ve checked it, ask them to say "done" so you can mark it complete.',
    },
    twilio: {
      label: 'Set up missed call forwarding',
      done: !!completedSteps.twilio,
      guide: `This turns every missed call into an automatic booking text. Their Tractify number is: ${twilioNumber}\n\nFor iPhone: Settings → Phone → Call Forwarding → When Unanswered → type in ${twilioNumber} → toggle on.\n\nFor Android: Open the Phone app → tap the 3-dot menu (⋮) → Settings → Supplementary services → Call forwarding → When unanswered → enter ${twilioNumber} → Save.\n\nOnce they confirm it's set up, mark this step complete.`,
    },
    gbp: {
      label: 'Add booking link to Google Business Profile',
      done: !!completedSteps.gbp,
      guide: `Their booking link is: ${bookingLink}\n\n${contractor.place_id ? `Direct link to their Google listing: https://www.google.com/maps/place/?q=place_id:${contractor.place_id} — tell them to click this, then look for the "Edit listing" or "Manage" button once signed in to Google.\n\n` : ''}Steps: Go to business.google.com → click their business name → Edit Profile → scroll down to "Appointments" → paste the booking link → Save.\n\nThis lets homeowners searching "HVAC near me" on Google book directly from the listing — free, zero ad spend. Once they confirm it's added, mark this step complete.`,
    },
    nextdoor: {
      label: 'Post in a local Nextdoor neighborhood',
      done: !!completedSteps.nextdoor,
      guide: `HVAC is the #1 requested service on Nextdoor. One post can bring 2-3 jobs.\n\nHere's the copy to paste:\n"Hey neighbors! ${contractor.company_name || contractor.name} now has online booking — pick a time that works for you: ${bookingLink}. Happy to help with any HVAC needs!"\n\nGo to nextdoor.com, find your neighborhood, paste the post. Once posted, mark this step complete.`,
    },
    facebook: {
      label: 'Post in a local Facebook community group',
      done: !!completedSteps.facebook,
      guide: `Search Facebook for "[Their City] Neighbors" or "[Their City] Community" groups. Join 1-2 and post once.\n\nHere's the copy:\n"Hi everyone! I run ${contractor.company_name || contractor.name} and we just launched online booking — no more phone tag, just pick a time that works for you: ${bookingLink}. Happy to help with heating or cooling needs!"\n\nGo to facebook.com/groups to find local groups. Once posted, mark this step complete.`,
    },
    reviewers: {
      label: 'Message your top Google reviewers',
      done: !!completedSteps.reviewers,
      guide: `Their past happy customers are the warmest possible leads. Go to business.google.com → Reviews → click "Reply" next to a review — this opens a message to that reviewer.\n\nHere's the message to send:\n"Hi [Name]! Thanks again for the kind review — it means a lot. We just launched online booking so you can schedule anytime without the phone tag: ${bookingLink}. Hope we can help again soon!"\n\nSend to their top 5-10 reviewers. Once they've done it, mark this step complete.`,
    },
  };

  // Personalize step order — skip Twilio if no number assigned, it's blocked on Jose
  const hasTwilioNumber = !!contractor.twilio_number;
  const incompleteSteps = Object.entries(STEP_DETAILS)
    .filter(([, s]) => !s.done)
    .sort(([keyA], [keyB]) => {
      // Move twilio to the end if no number is assigned yet
      if (!hasTwilioNumber) {
        if (keyA === 'twilio') return 1;
        if (keyB === 'twilio') return -1;
      }
      return 0;
    });
  const completedCount = Object.values(STEP_DETAILS).filter(s => s.done).length;

  const checklistSummary = Object.entries(STEP_DETAILS).map(([key, s]) =>
    `  [${s.done ? '✓' : ' '}] ${s.label}`
  ).join('\n');

  const systemPrompt = `You are the Tractify AI assistant built into the contractor portal for ${contractor.company_name || contractor.name}. You help contractors manage their calendar AND guide them through their setup steps — all through conversation, no menu navigation needed.

CONTRACTOR:
  Name: ${contractor.name}
  Company: ${contractor.company_name || 'N/A'}
  Booking link: ${bookingLink}
  Today: ${todayDayName}, ${today}

SETUP CHECKLIST (${completedCount}/${Object.keys(STEP_DETAILS).length} complete):
${checklistSummary}
${incompleteSteps.length > 0 ? `\nNext step to guide them through: "${incompleteSteps[0][1].label}"` : '\nAll setup steps complete!'}

STEP-BY-STEP GUIDES (for incomplete steps only):
${incompleteSteps.map(([key, s]) => `\n[${s.label}]\n${s.guide}`).join('\n')}

UPCOMING APPOINTMENTS (next 14 days):
${apptText}

REGULAR WEEKLY SCHEDULE:
${scheduleText}

${!hasTwilioNumber ? `⚠️ TWILIO NUMBER NOT ASSIGNED YET: Their Tractify phone number (step 2) hasn't been set up yet — this is Jose's job on the backend. If they ask about step 2, tell them "Your Tractify number is being set up — it'll be in your welcome email shortly. Let's get the other steps done in the meantime." Then guide them to step 3 (GBP), 4 (Nextdoor), 5 (Facebook), or 6 (Reviewers) instead.` : ''}

WHAT YOU CAN DO:
  - Guide them through setup steps one at a time, with exact copy-paste text and step-by-step instructions
  - Mark a setup step complete when they confirm they've done it (use the complete_setup_step tool)
  - Block time on their calendar ("block Tuesday 2pm to 4pm" or "I have a job Thursday morning")
  - Cancel a booked appointment (homeowner gets a rebook link automatically)
  - Tell them what's on their calendar on any day or time range
  - Answer questions about how Tractify works

RULES:
  - Be short. Contractors are usually on job sites. 1–3 sentences max unless guiding through a setup step.
  - When guiding a setup step: give one clear action at a time, then ask "Done?" before moving to the next instruction.
  - After completing a setup step: use the complete_setup_step tool to mark it, then congratulate them briefly and offer to start the next incomplete step.
  - After blocking time, confirm: "Done — [day] [date] from [time] to [time] is blocked."
  - After cancelling a REAL_APPOINTMENT: "Done — [name]'s appointment is cancelled. They'll get a rebook link automatically."
  - After clearing an EXTERNAL_BLOCK: "Done — [time] on [date] is now open." Never mention homeowners for blocks.
  - Never guess at appointment IDs. Only cancel appointments shown in the list above.
  - If a date is ambiguous, confirm which one before acting.
  - If they ask "what do I need to set up" or "how do I get started", walk them through the incomplete steps in order.`;

  // ── Tool definitions ──────────────────────────────────────────────────────
  const tools = [
    {
      name: 'block_time',
      description: 'Block time on the contractor calendar to prevent new bookings. Use when the contractor says they have a job, appointment, errand, vacation, or any other reason to block time.',
      input_schema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date to block in YYYY-MM-DD format',
          },
          start_time: {
            type: 'string',
            description: 'Start time in HH:MM 24-hour format (e.g. "14:00" for 2pm, "09:00" for 9am)',
          },
          duration_hours: {
            type: 'number',
            description: 'How many hours to block. Can be decimal (e.g. 1.5 for 90 minutes, 2.5 for 2.5 hours)',
          },
        },
        required: ['date', 'start_time', 'duration_hours'],
      },
    },
    {
      name: 'complete_setup_step',
      description: 'Mark a setup/onboarding step as complete after the contractor confirms they have done it. Only call this after explicit confirmation from the contractor.',
      input_schema: {
        type: 'object',
        properties: {
          step_key: {
            type: 'string',
            enum: ['service_area', 'availability', 'twilio', 'gbp', 'nextdoor', 'facebook', 'reviewers', 'messenger'],
            description: 'The step key to mark complete',
          },
        },
        required: ['step_key'],
      },
    },
    {
      name: 'set_service_zip_codes',
      description: 'Save the list of zip codes this contractor services, as part of the service-area setup step. Call this once you have real 5-digit zip codes from them. Only pass no_limit=true if they explicitly say they have no service-area limit and will go anywhere — never assume that.',
      input_schema: {
        type: 'object',
        properties: {
          zip_codes: {
            type: 'array',
            items: { type: 'string' },
            description: '5-digit zip codes they service, exactly as they gave them. Omit if no_limit is true.',
          },
          no_limit: {
            type: 'boolean',
            description: 'true ONLY if they explicitly said they have no service-area limit / will travel anywhere. Do not set this just because they gave an unclear answer.',
          },
        },
        required: [],
      },
    },
    {
      name: 'cancel_appointment',
      description: 'Cancel a booked appointment. The homeowner is notified automatically with a link to rebook. Only use IDs from the appointment list provided.',
      input_schema: {
        type: 'object',
        properties: {
          appointment_id: {
            type: 'string',
            description: 'The appointment ID from the list (e.g. "42")',
          },
        },
        required: ['appointment_id'],
      },
    },
  ];

  // ── Call Claude ───────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages = [
    ...history.slice(-10),
    { role: 'user', content: message },
  ];

  let response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    tools,
    messages,
  });

  // ── Handle tool use (agentic loop) ────────────────────────────────────────
  let actionTaken = null;
  const toolMessages = [...messages];

  while (response.stop_reason === 'tool_use') {
    const toolUseBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolUseBlock) break;

    const { name, id: toolUseId, input } = toolUseBlock;
    let toolResult;

    if (name === 'complete_setup_step') {
      try {
        const { step_key } = input;
        await db.query(`
          UPDATE contractors
          SET onboarding_steps = COALESCE(onboarding_steps, '{}'::jsonb) || $1::jsonb,
              onboarding_started_at = COALESCE(onboarding_started_at, NOW())
          WHERE id = $2
        `, [JSON.stringify({ [step_key]: true }), contractorId]);
        toolResult = `Step "${step_key}" marked complete.`;
        actionTaken = { type: 'complete_setup_step', step_key };
        console.log(`[AI-CHAT] Marked step "${step_key}" complete for contractor ${contractorId}`);
      } catch (err) {
        toolResult = `Error marking step complete: ${err.message}`;
        console.error('[AI-CHAT] complete_setup_step error:', err.message);
      }
    } else if (name === 'set_service_zip_codes') {
      try {
        const { zip_codes, no_limit } = input;
        let toSave = null;
        let humanSummary = '';

        if (no_limit) {
          toSave = ['*'];
          humanSummary = 'no service-area limit (serves anywhere)';
        } else {
          const cleaned = Array.isArray(zip_codes)
            ? zip_codes.map(z => String(z).replace(/\D/g, '').slice(0, 5)).filter(z => z.length === 5)
            : [];
          if (cleaned.length) {
            toSave = cleaned;
            humanSummary = `${cleaned.length} zip code${cleaned.length === 1 ? '' : 's'} (${cleaned.join(', ')})`;
          }
        }

        if (!toSave) {
          toolResult = `Error: no valid 5-digit zip codes found in that reply — ask them to send the zip codes again, digits only, separated by commas or spaces.`;
        } else {
          // Same fix as the SMS drip (smsAI.js) — a real gap left over from the
          // pivot away from the old intake form, which used to collect service-
          // area zip codes explicitly. The replacement ("derive it automatically
          // from the geocoded address") was never built, so service_zip_codes was
          // hardcoded to the wildcard ["*"] for every contractor, which makes
          // Brain 3's isInServiceArea() check a no-op. Kept here in sync with
          // smsAI.js's identical handler so the portal Help chat and the SMS drip
          // both actually complete this step, not just one of them.
          await db.query(`
            UPDATE contractors
            SET service_zip_codes = $1,
                onboarding_steps = COALESCE(onboarding_steps, '{}'::jsonb) || '{"service_area": true}'::jsonb,
                onboarding_started_at = COALESCE(onboarding_started_at, NOW())
            WHERE id = $2
          `, [JSON.stringify(toSave), contractorId]);
          toolResult = `Saved service area: ${humanSummary}. Step marked complete.`;
          actionTaken = { type: 'complete_setup_step', step_key: 'service_area' };
          console.log(`[AI-CHAT] service_zip_codes set for ${contractorId}: ${humanSummary}`);
        }
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[AI-CHAT] set_service_zip_codes error:', err.message);
      }
    } else if (name === 'block_time') {
      try {
        // Build one slot per hour (calendar renders per-hour blocks)
        const [startH, startM] = input.start_time.split(':').map(Number);
        const totalSlots = Math.ceil(input.duration_hours);
        const slots = [];
        for (let i = 0; i < totalSlots; i++) {
          const h = startH + i;
          if (h > 23) break;
          slots.push(`${String(h).padStart(2, '0')}:${String(startM).padStart(2, '0')}`);
        }

        const inserted = [];
        const conflicts = [];
        for (const slotTime of slots) {
          try {
            const blockId = uuidv4();
            await db.query(
              `INSERT INTO appointments
                 (id, contractor_id, lead_id, scheduled_date, scheduled_time, duration_minutes, status, notes)
               VALUES ($1, $2, NULL, $3, $4, 60, 'external', 'Blocked via AI assistant')`,
              [blockId, contractorId, input.date, slotTime]
            );
            inserted.push(slotTime);
          } catch (e) {
            if (e.code === '23505' || (e.message && e.message.includes('UNIQUE'))) {
              conflicts.push(slotTime);
            } else {
              throw e;
            }
          }
        }

        const endH = startH + totalSlots;
        const endTime = `${String(endH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
        toolResult = `Blocked ${inserted.length} slots on ${input.date}: ${input.start_time} to ${endTime}. ${conflicts.length > 0 ? `${conflicts.length} already blocked.` : ''}`;
        actionTaken = { type: 'block_time', date: input.date, start_time: input.start_time, duration_hours: input.duration_hours };
        console.log(`[AI-CHAT] Blocked ${inserted.length} slots for contractor ${contractorId}: ${input.date} ${input.start_time}–${endTime}`);
      } catch (err) {
        toolResult = `Error blocking time: ${err.message}`;
        console.error('[AI-CHAT] block_time error:', err.message);
      }
    } else if (name === 'cancel_appointment') {
      try {
        const apptCheck = await db.query(
          `SELECT a.*, l.name as lead_name, l.email as lead_email, l.phone as lead_phone
           FROM appointments a
           LEFT JOIN leads l ON a.lead_id = l.id
           WHERE a.id = $1 AND a.contractor_id = $2`,
          [input.appointment_id, contractorId]
        );
        if (!apptCheck.rows.length) {
          toolResult = 'Appointment not found or does not belong to this contractor.';
        } else {
          const appt = apptCheck.rows[0];
          await db.query(
            `UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
            [input.appointment_id]
          );

          const isExternalBlock = !appt.lead_id;

          if (!isExternalBlock) {
            // Real customer appointment — reset lead status and send rebook link
            await db.query(`UPDATE leads SET status = 'matched' WHERE id = $1`, [appt.lead_id]);
            logEvent(appt.lead_id, 'cancelled', 'contractor', `Appointment ${input.appointment_id} cancelled via AI assistant`).catch(() => {});

            const contractorRow = await db.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
            const lead = { id: appt.lead_id, name: appt.lead_name, email: appt.lead_email, phone: appt.lead_phone };
            const contractorData = contractorRow.rows[0];

            if (lead.email && contractorData) {
              // Invalidate old tokens, issue a new rebook token
              await db.query(`UPDATE booking_tokens SET used = 1 WHERE lead_id = $1 AND used = 0`, [lead.id]);
              const newToken = uuidv4();
              const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
              await db.query(
                `INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
                [uuidv4(), lead.id, newToken, expiresAt]
              );
              const bookingUrl = `${process.env.FRONTEND_URL || 'https://tractifyhq.com'}/book/${newToken}`;
              notifications.sendCancellationAndRebook(lead, contractorData, bookingUrl).catch(console.error);
            }

            toolResult = `REAL_APPOINTMENT_CANCELLED: ${appt.lead_name} on ${appt.scheduled_date} at ${appt.scheduled_time}. Rebook link sent to homeowner.`;
          } else {
            // External block — just cleared, no customer involved
            toolResult = `EXTERNAL_BLOCK_CLEARED: ${appt.scheduled_date} at ${appt.scheduled_time} is now open.`;
          }

          actionTaken = { type: 'cancel_appointment', appointment_id: input.appointment_id };
          console.log(`[AI-CHAT] Cancelled ${isExternalBlock ? 'block' : 'appointment'} ${input.appointment_id} for contractor ${contractorId}`);
        }
      } catch (err) {
        toolResult = `Error cancelling appointment: ${err.message}`;
        console.error('[AI-CHAT] cancel_appointment error:', err.message);
      }
    } else {
      toolResult = `Unknown tool: ${name}`;
    }

    // Continue with tool result
    toolMessages.push({ role: 'assistant', content: response.content });
    toolMessages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: toolResult }],
    });

    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      tools,
      messages: toolMessages,
    });
  }

  const reply = response.content.find(b => b.type === 'text')?.text
    || "Sorry, I couldn't process that. Try rephrasing.";

  res.json({ reply, action: actionTaken });
});

module.exports = router;
