const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireContractor } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');

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
    db.query('SELECT * FROM contractors WHERE id = $1', [contractorId]),
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

  const systemPrompt = `You are the Tractify AI assistant built into the contractor portal for ${contractor.company_name || contractor.name}. You help contractors manage their calendar and get answers fast — without navigating menus or clicking around the portal.

CONTRACTOR:
  Name: ${contractor.name}
  Company: ${contractor.company_name || 'N/A'}
  Today: ${todayDayName}, ${today}

UPCOMING APPOINTMENTS (next 14 days):
${apptText}

REGULAR WEEKLY SCHEDULE:
${scheduleText}

WHAT YOU CAN DO:
  - Block time on their calendar (e.g. "block Tuesday 2pm to 4pm" or "I have a job Thursday morning")
  - Cancel a booked appointment (homeowner gets notified and a rebook link automatically)
  - Tell them what's on their calendar on any day or time range
  - Answer questions about how Tractify works

RULES:
  - Be short. Contractors are usually on job sites. 1–3 sentences max unless they ask for more detail.
  - After blocking time, confirm clearly: "Done — [day] [date] from [time] to [time] is blocked."
  - After cancelling, confirm: "Done — [name]'s appointment on [date] at [time] has been cancelled. They'll get an automatic text to rebook."
  - Never guess at appointment IDs. Only cancel appointments that appear in the list above.
  - If the date is ambiguous (e.g. "Tuesday" could be this Tuesday or next), confirm which one before acting.
  - If someone asks something you can't do, say so plainly and suggest what they can do in the portal instead.`;

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

    if (name === 'block_time') {
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
          `SELECT a.*, l.name as lead_name FROM appointments a
           LEFT JOIN leads l ON a.lead_id = l.id
           WHERE a.id = $1 AND a.contractor_id = $2`,
          [input.appointment_id, contractorId]
        );
        if (!apptCheck.rows.length) {
          toolResult = 'Appointment not found or does not belong to this contractor.';
        } else {
          await db.query(
            `UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
            [input.appointment_id]
          );
          const appt = apptCheck.rows[0];
          toolResult = `Cancelled appointment ${input.appointment_id} (${appt.lead_name || 'manual block'} on ${appt.scheduled_date} at ${appt.scheduled_time}).`;
          actionTaken = { type: 'cancel_appointment', appointment_id: input.appointment_id };
          console.log(`[AI-CHAT] Cancelled appointment ${input.appointment_id} for contractor ${contractorId}`);
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
