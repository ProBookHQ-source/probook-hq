/**
 * smsAI.js — Two-way AI SMS assistant for contractors
 *
 * Handles inbound SMS from contractors. Loads their full context (schedule,
 * appointments, setup steps), calls Claude with an SMS-optimized prompt,
 * executes tool actions (block time, mark step done, cancel appointment),
 * persists conversation history in the DB, and returns a plain-text reply
 * for Twilio to send back.
 *
 * Called from backend/routes/twilio.js when an inbound SMS is identified
 * as coming from the contractor's own phone number.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const notifications = require('./notifications');
const { logEvent } = require('./auditLog');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleContractorSms(contractor, incomingText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[SMS-AI] No ANTHROPIC_API_KEY set — skipping AI reply');
    return "I'm having trouble connecting right now. Text back in a few minutes or log in at tractifyhq.com/contractor.";
  }

  const contractorId = contractor.id;
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ── Load context ────────────────────────────────────────────────────────────
  const [apptResult, slotsResult] = await Promise.all([
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
    db.query('SELECT * FROM availability_slots WHERE contractor_id = $1 ORDER BY day_of_week', [contractorId]),
  ]);

  const appointments = apptResult.rows;
  const slots = slotsResult.rows;

  // ── Load SMS conversation history (last 10 messages) ───────────────────────
  const convRaw = contractor.sms_conversation;
  const history = Array.isArray(convRaw)
    ? convRaw.slice(-10)
    : (typeof convRaw === 'string' ? JSON.parse(convRaw || '[]').slice(-10) : []);

  // ── Build context strings ───────────────────────────────────────────────────
  const scheduleText = slots.length
    ? slots.map(s => `${DAYS[s.day_of_week]}: ${fmtTime(s.start_time)}-${fmtTime(s.end_time)}`).join(', ')
    : 'No schedule set';

  const apptText = appointments.length
    ? appointments.slice(0, 5).map(a => {
        const name = a.lead_name || (a.notes ? 'Blocked' : 'Direct booking');
        const d = new Date(a.scheduled_date + 'T12:00:00');
        return `[${a.id}] ${DAYS[d.getDay()]} ${a.scheduled_date} ${fmtTime(a.scheduled_time)} — ${name} (${a.status})`;
      }).join('\n')
    : 'No upcoming appointments';

  const completedSteps = typeof contractor.onboarding_steps === 'string'
    ? JSON.parse(contractor.onboarding_steps || '{}')
    : (contractor.onboarding_steps || {});

  const bookingLink = contractor.booking_slug
    ? `https://tractifyhq.com/schedule/${contractor.booking_slug}`
    : 'https://tractifyhq.com/schedule';

  const twilioNumber = contractor.twilio_number || '(not assigned yet)';
  const hasTwilioNumber = !!contractor.twilio_number;

  const STEP_GUIDES = {
    availability: {
      label: 'Confirm your schedule',
      done: !!completedSteps.availability,
      guide: 'Their hours are pre-set from intake. Ask them to confirm they look right. Say "done" when confirmed.',
    },
    twilio: {
      label: 'Set up missed call forwarding',
      done: !!completedSteps.twilio,
      guide: `Forward unanswered calls to ${twilioNumber}. iPhone: Settings > Phone > Call Forwarding > When Unanswered > type ${twilioNumber} > on. Android: Phone app > menu > Settings > Call forwarding > When unanswered > ${twilioNumber}. Text DONE when set up.`,
    },
    gbp: {
      label: 'Add booking link to Google Business Profile',
      done: !!completedSteps.gbp,
      guide: `Go to business.google.com > Edit Profile > scroll to Appointments > paste this link: ${bookingLink} > Save. Text DONE when done.`,
    },
    nextdoor: {
      label: 'Post on Nextdoor',
      done: !!completedSteps.nextdoor,
      guide: `Go to nextdoor.com, find your neighborhood, and post: "Hey neighbors! ${contractor.company_name || contractor.name} now has online booking — pick a time here: ${bookingLink}. Happy to help with any HVAC needs!" Text DONE when posted.`,
    },
    facebook: {
      label: 'Post in a local Facebook group',
      done: !!completedSteps.facebook,
      guide: `Search Facebook for your city + "neighbors" or "community" groups. Post: "Hi everyone! I run ${contractor.company_name || contractor.name} and just launched online booking. No phone tag — just pick a time: ${bookingLink}." Text DONE when posted.`,
    },
    reviewers: {
      label: 'Message your Google reviewers',
      done: !!completedSteps.reviewers,
      guide: `Go to business.google.com > Reviews > click Reply next to each review. Send: "Hi [Name]! Thanks for the review. We just launched online booking — book anytime here: ${bookingLink}. Hope we can help again!" Text DONE when sent.`,
    },
    messenger: {
      label: 'Set up Messenger + Instagram auto-reply',
      done: !!completedSteps.messenger,
      guide: `Go to business.facebook.com > Inbox > Automation > Instant Replies > toggle on > paste: "Thanks for reaching out to ${contractor.company_name || contractor.name}! Book a time here: ${bookingLink} — takes 60 seconds." > Save. Text DONE when done.`,
    },
  };

  const incompleteSteps = Object.entries(STEP_GUIDES).filter(([, s]) => !s.done);
  const completedCount = Object.values(STEP_GUIDES).filter(s => s.done).length;
  const totalSteps = Object.keys(STEP_GUIDES).length;
  const nextStep = incompleteSteps[0];

  const todayName = DAYS[new Date().getDay()];
  const firstName = (contractor.name || '').split(' ')[0] || 'there';

  // ── System prompt — SMS-optimized ──────────────────────────────────────────
  const systemPrompt = `You are the Tractify AI assistant texting with ${firstName} from ${contractor.company_name || contractor.name}. You communicate via SMS — short, conversational, no bullet points, no markdown, no asterisks.

CONTRACTOR:
  Name: ${contractor.name}
  Company: ${contractor.company_name || 'N/A'}
  Booking link: ${bookingLink}
  Today: ${todayName}, ${today}

SETUP PROGRESS (${completedCount}/${totalSteps} done):
${Object.entries(STEP_GUIDES).map(([k, s]) => `  [${s.done ? 'done' : 'todo'}] ${s.label}`).join('\n')}
${nextStep ? `\nNext step for them: "${nextStep[1].label}"` : '\nAll steps done!'}

UPCOMING APPOINTMENTS:
${apptText}

REGULAR SCHEDULE:
${scheduleText}

${!hasTwilioNumber ? `NOTE: Their Tractify phone number hasn't been assigned yet. If they ask about call forwarding (step 2), tell them it's being set up and you'll text them when ready. Guide them to the other steps instead.` : ''}

WHAT YOU CAN DO:
- Guide them through each setup step (send exact copy-paste text when needed)
- Mark a step done when they confirm (use complete_setup_step tool)
- Block time on their calendar
- Cancel an appointment (homeowner gets rebook link automatically)
- Tell them what's on their calendar

RULES — CRITICAL:
- Keep every reply under 320 characters. This is a text message, not an email.
- No bullet points, no asterisks, no markdown, no numbered lists. Write like a real text.
- One thing at a time. Don't dump all the steps at once — guide them through one step, wait for done, then offer the next.
- When they say "done", "yes", "ok", "finished", "set it up" — mark the current step complete immediately using the tool.
- After marking a step done: congratulate in one sentence, immediately offer the next step.
- When guiding a step: give ONE clear instruction and end with "Text DONE when you're set up."
- If they ask what to do next, tell them just the next incomplete step.
- If all steps are done: tell them their channels are live and jobs should start coming in.
- If they ask about their calendar, give a brief summary — day, time, name.
- Detect which step is "current" from context (what were you last guiding them through?).`;

  // ── Tools (same as portal chat) ────────────────────────────────────────────
  const tools = [
    {
      name: 'complete_setup_step',
      description: 'Mark a setup step complete after the contractor confirms they have done it.',
      input_schema: {
        type: 'object',
        properties: {
          step_key: {
            type: 'string',
            enum: ['availability', 'twilio', 'gbp', 'nextdoor', 'facebook', 'reviewers', 'messenger'],
          },
        },
        required: ['step_key'],
      },
    },
    {
      name: 'block_time',
      description: 'Block time on the contractor calendar. Use when contractor says they have a job or need to block time.',
      input_schema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          start_time: { type: 'string', description: 'Start time in HH:MM 24-hour format' },
          duration_hours: { type: 'number', description: 'Hours to block (can be decimal)' },
        },
        required: ['date', 'start_time', 'duration_hours'],
      },
    },
    {
      name: 'cancel_appointment',
      description: 'Cancel a booked appointment. Homeowner gets rebook link automatically.',
      input_schema: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment ID from the list' },
        },
        required: ['appointment_id'],
      },
    },
  ];

  // ── Call Claude ─────────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages = [
    ...history,
    { role: 'user', content: incomingText },
  ];

  let response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300, // Hard limit — forces concise SMS responses
    system: systemPrompt,
    tools,
    messages,
  });

  // ── Tool use loop ───────────────────────────────────────────────────────────
  const toolMessages = [...messages];

  while (response.stop_reason === 'tool_use') {
    const toolBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolBlock) break;

    const { name, id: toolUseId, input } = toolBlock;
    let toolResult = '';

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
        console.log(`[SMS-AI] Marked step "${step_key}" complete for contractor ${contractorId}`);
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] complete_setup_step error:', err.message);
      }

    } else if (name === 'block_time') {
      try {
        const [startH, startM] = input.start_time.split(':').map(Number);
        const totalSlots = Math.ceil(input.duration_hours);
        let inserted = 0;
        for (let i = 0; i < totalSlots; i++) {
          const h = startH + i;
          if (h > 23) break;
          const slotTime = `${String(h).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
          try {
            await db.query(
              `INSERT INTO appointments (id, contractor_id, lead_id, scheduled_date, scheduled_time, duration_minutes, status, notes)
               VALUES ($1, $2, NULL, $3, $4, 60, 'external', 'Blocked via AI SMS')`,
              [uuidv4(), contractorId, input.date, slotTime]
            );
            inserted++;
          } catch (e) {
            if (!e.message?.includes('UNIQUE')) throw e;
          }
        }
        toolResult = `Blocked ${inserted} hour(s) on ${input.date} starting ${input.start_time}.`;
        console.log(`[SMS-AI] Blocked ${inserted} slots for ${contractorId}: ${input.date} ${input.start_time}`);
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] block_time error:', err.message);
      }

    } else if (name === 'cancel_appointment') {
      try {
        const { rows } = await db.query(
          `SELECT a.*, l.name as lead_name, l.email as lead_email, l.phone as lead_phone
           FROM appointments a LEFT JOIN leads l ON a.lead_id = l.id
           WHERE a.id = $1 AND a.contractor_id = $2`,
          [input.appointment_id, contractorId]
        );
        if (!rows.length) {
          toolResult = 'Appointment not found.';
        } else {
          const appt = rows[0];
          await db.query(`UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [input.appointment_id]);
          if (appt.lead_id) {
            await db.query(`UPDATE leads SET status = 'matched' WHERE id = $1`, [appt.lead_id]);
            logEvent(appt.lead_id, 'cancelled', 'contractor', 'Cancelled via AI SMS').catch(() => {});
            const contractorRow = await db.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
            if (appt.lead_email && contractorRow.rows[0]) {
              await db.query(`UPDATE booking_tokens SET used = 1 WHERE lead_id = $1 AND used = 0`, [appt.lead_id]);
              const newToken = uuidv4();
              await db.query(
                `INSERT INTO booking_tokens (id, lead_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
                [uuidv4(), appt.lead_id, newToken, new Date(Date.now() + 24 * 3600 * 1000)]
              );
              const bookingUrl = `${process.env.FRONTEND_URL || 'https://tractifyhq.com'}/book/${newToken}`;
              notifications.sendCancellationAndRebook(
                { id: appt.lead_id, name: appt.lead_name, email: appt.lead_email, phone: appt.lead_phone },
                contractorRow.rows[0],
                bookingUrl
              ).catch(console.error);
            }
            toolResult = `REAL_APPOINTMENT_CANCELLED: ${appt.lead_name} on ${appt.scheduled_date} at ${appt.scheduled_time}. Homeowner gets rebook link.`;
          } else {
            toolResult = `EXTERNAL_BLOCK_CLEARED: ${appt.scheduled_date} at ${appt.scheduled_time} is now open.`;
          }
          console.log(`[SMS-AI] Cancelled appointment ${input.appointment_id} for ${contractorId}`);
        }
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] cancel_appointment error:', err.message);
      }
    } else {
      toolResult = `Unknown tool: ${name}`;
    }

    toolMessages.push({ role: 'assistant', content: response.content });
    toolMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: toolResult }] });

    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      tools,
      messages: toolMessages,
    });
  }

  const reply = response.content.find(b => b.type === 'text')?.text
    || "Got it! Log in at tractifyhq.com/contractor if you need anything.";

  // ── Persist conversation (keep last 20 messages = 10 exchanges) ─────────────
  const updatedHistory = [
    ...history,
    { role: 'user', content: incomingText },
    { role: 'assistant', content: reply },
  ].slice(-20);

  await db.query(
    `UPDATE contractors SET sms_conversation = $1::jsonb WHERE id = $2`,
    [JSON.stringify(updatedHistory), contractorId]
  ).catch(err => console.error('[SMS-AI] Failed to persist conversation:', err.message));

  return reply;
}

// ── Send a proactive setup step text ─────────────────────────────────────────
// Called by the drip cron and on first Twilio number assignment.
async function sendSetupStepText(contractor, twilioClient) {
  const completedSteps = typeof contractor.onboarding_steps === 'string'
    ? JSON.parse(contractor.onboarding_steps || '{}')
    : (contractor.onboarding_steps || {});

  const STEP_ORDER = ['availability', 'twilio', 'gbp', 'nextdoor', 'facebook', 'reviewers', 'messenger'];
  const nextIncomplete = STEP_ORDER.find(k => !completedSteps[k]);
  if (!nextIncomplete) return null; // all done

  const bookingLink = contractor.booking_slug
    ? `https://tractifyhq.com/schedule/${contractor.booking_slug}`
    : 'https://tractifyhq.com/schedule';

  const firstName = (contractor.name || '').split(' ')[0] || 'there';
  const bizName = contractor.company_name || contractor.name;
  const twilioNum = contractor.twilio_number;

  const STEP_TEXTS = {
    availability: `Hey ${firstName}! Your Tractify site is live. Step 1: confirm your schedule looks right at tractifyhq.com/contractor — your hours were pre-set. Text DONE when you've checked it!`,
    twilio: `Step 2: forward unanswered calls to your Tractify number ${twilioNum}. iPhone: Settings > Phone > Call Forwarding > When Unanswered > enter ${twilioNum} > on. Text DONE when set up!`,
    gbp: `Step 3: add your booking link to Google Business Profile. Go to business.google.com > Edit Profile > Appointments > paste ${bookingLink} > Save. Text DONE when done!`,
    nextdoor: `Step 4: post in your local Nextdoor neighborhood — takes 2 min. Text COPY to get the post text, or just let me write it for you!`,
    facebook: `Step 5: post in a local Facebook community group. Text COPY to get the post text, or say "write it for me" and I'll send it over!`,
    reviewers: `Step 6: message your top Google reviewers. They already trust you — a quick message books more jobs than almost anything else. Text COPY for the message template!`,
    messenger: `Last step! Set up auto-reply on Facebook Messenger + Instagram so every DM gets your booking link instantly. Go to business.facebook.com > Inbox > Automation > Instant Replies. Text COPY for the reply text!`,
  };

  const textBody = STEP_TEXTS[nextIncomplete];

  await twilioClient.messages.create({
    to: contractor.phone,
    from: twilioNum,
    body: textBody,
  });

  await db.query(
    `UPDATE contractors SET last_setup_sms_at = NOW() WHERE id = $1`,
    [contractor.id]
  );

  console.log(`[SMS-AI] Drip text sent to ${contractor.name} (${contractor.id}) — step: ${nextIncomplete}`);
  return nextIncomplete;
}

// ── Welcome text — fires when Twilio number is first assigned ─────────────────
async function sendWelcomeText(contractor, twilioClient) {
  const firstName = (contractor.name || '').split(' ')[0] || 'there';
  const siteUrl = contractor.booking_slug
    ? `https://${contractor.booking_slug.replace(/[^a-z0-9]/g, '')}.tractifyhq.com`
    : 'tractifyhq.com';

  const body = `Hey ${firstName}! Your Tractify booking site is live. I'll text you one quick step per day to get all your channels running. Text me anytime with questions or to tell me when you've finished a step. — Jose, Tractify`;

  await twilioClient.messages.create({
    to: contractor.phone,
    from: contractor.twilio_number,
    body,
  });

  await db.query(
    `UPDATE contractors SET sms_welcome_sent = 1, last_setup_sms_at = NOW() WHERE id = $1`,
    [contractor.id]
  );

  console.log(`[SMS-AI] Welcome text sent to ${contractor.name} (${contractor.id})`);
}

module.exports = { handleContractorSms, sendSetupStepText, sendWelcomeText };
