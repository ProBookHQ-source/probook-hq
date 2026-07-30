/**
 * smsAI.js — Two-way AI SMS assistant for contractors
 *
 * Three phases:
 *   Phase 1 — Activation (days 1-7): 2 required steps + specialty messages
 *   Phase 2 — Orientation: power message (after step 1) + calendar blocking (after step 2)
 *   Phase 3 — Ongoing loop: post-appointment close tracking, calendar management forever
 *
 * Exports:
 *   handleContractorSms        — inbound SMS handler
 *   sendSetupStepText          — drip cron: next incomplete step
 *   sendWelcomeText            — fires on first Twilio number assignment
 *   sendPowerMessage           — fires after step 1 (availability) confirmed
 *   sendCalendarTrainingMessage — fires after step 2 (twilio) confirmed
 *   sendPostAppointmentText    — fires 30-90 min after appointment time
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

function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleContractorSms(contractor, incomingText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[SMS-AI] No ANTHROPIC_API_KEY set — skipping AI reply');
    return "I'm having trouble connecting right now. Text back in a few minutes or log in at tractifyhq.com/contractor.";
  }

  const contractorId = contractor.id;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const twoWeeksOut = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ── Load context ────────────────────────────────────────────────────────────
  const [apptResult, slotsResult] = await Promise.all([
    db.query(
      `SELECT a.id, a.scheduled_date, a.scheduled_time, a.duration_minutes, a.status, a.notes,
              a.did_close, a.closed_value,
              l.name as lead_name, l.phone as lead_phone, l.email as lead_email,
              l.zip_code as lead_zip, l.description as lead_description
       FROM appointments a
       LEFT JOIN leads l ON a.lead_id = l.id
       WHERE a.contractor_id = $1
         AND a.status NOT IN ('cancelled')
         AND (
           (a.scheduled_date >= $2 AND a.scheduled_date <= $3)
           OR a.scheduled_date = $4
         )
       ORDER BY a.scheduled_date, a.scheduled_time`,
      [contractorId, today, twoWeeksOut, yesterday]
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

  // Upcoming + recent past appointments for outcome tracking context
  const upcomingAppts = appointments.filter(a => a.scheduled_date >= today);
  const recentPastAppts = appointments.filter(a => a.scheduled_date < today && a.did_close === null && a.lead_name);

  const apptText = upcomingAppts.length
    ? upcomingAppts.slice(0, 5).map(a => {
        const name = a.lead_name || (a.notes ? 'Blocked' : 'Direct booking');
        const phone = a.lead_phone ? ` · ${a.lead_phone}` : '';
        const mapsLink = a.lead_zip ? ` · maps.apple.com/?q=${a.lead_zip}+WA` : '';
        const d = new Date(a.scheduled_date + 'T12:00:00');
        return `[${a.id}] ${DAYS[d.getDay()]} ${a.scheduled_date} ${fmtTime(a.scheduled_time)} — ${name}${phone}${mapsLink}`;
      }).join('\n')
    : 'No upcoming appointments';

  const pastApptText = recentPastAppts.length
    ? '\nRECENT PAST (outcome not yet logged):\n' + recentPastAppts.map(a =>
        `[${a.id}] ${a.scheduled_date} ${fmtTime(a.scheduled_time)} — ${a.lead_name} (outcome: not logged)`
      ).join('\n')
    : '';

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
      guide: 'Their hours were pre-set from the intake form. Ask them to confirm they look right at tractifyhq.com/contractor. Text DONE when confirmed.',
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
      guide: `Go to nextdoor.com, find your neighborhood, and post: "Hey neighbors! ${contractor.company_name || contractor.name} now has online booking — pick a time here: ${bookingLink}. Happy to help with any needs!" Text DONE when posted.`,
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

  // ── System prompt ───────────────────────────────────────────────────────────
  const systemPrompt = `You are the Tractify assistant texting with ${firstName} from ${contractor.company_name || contractor.name}. You communicate via SMS — short, conversational, no bullet points, no markdown, no asterisks, no numbered lists. Write like a real text message.

CONTRACTOR:
  Name: ${contractor.name}
  Company: ${contractor.company_name || 'N/A'}
  Booking link: ${bookingLink}
  Today: ${todayName}, ${today}

SETUP PROGRESS (${completedCount}/${totalSteps} channels active):
${Object.entries(STEP_GUIDES).map(([k, s]) => `  [${s.done ? 'done' : 'todo'}] ${s.label}`).join('\n')}
${nextStep ? `\nNext step: "${nextStep[1].label}"` : '\nAll steps done!'}

UPCOMING APPOINTMENTS:
${apptText}${pastApptText}

REGULAR SCHEDULE:
${scheduleText}

${!hasTwilioNumber ? `NOTE: Their Tractify phone number hasn't been assigned yet. If they ask about call forwarding (step 2), tell them it's being set up and you'll text when ready.` : ''}

WHAT YOU CAN DO:
- Guide them through setup steps (one at a time — never dump all at once)
- Mark a step done when they confirm (use complete_setup_step tool)
- Block time on their calendar when they have an outside job or need time off
- Cancel an appointment (homeowner gets rebook link automatically)
- Answer "what's on my calendar" — give a brief, clear summary
- Log job outcomes when they reply to a post-appointment check-in (use log_job_outcome tool)

RULES — CRITICAL:
- Every reply must be under 320 characters. This is a text message, not an email.
- No bullet points, no asterisks, no markdown, no numbered lists. One sentence flows into the next.
- One thing at a time. Guide them through one step, wait for done, move to the next.
- When they say "done", "yes", "ok", "finished", "set it up" — mark the current step complete immediately.
- After marking a step done: one congratulations sentence, then offer the next step.
- When guiding a step: give ONE clear instruction, end with "Reply DONE when set."
- If they ask what's next, tell them just the next incomplete step.
- If all steps done: tell them all channels are live and jobs are coming.
- Calendar questions: reply with day, time, name — brief and clear.
- If they reply YES $amount or NO to a check-in about a past job — use log_job_outcome immediately.

CALENDAR RESPONSE FORMAT:
When they ask about jobs or their schedule, show each job on its own line:
Time — Service · Name · Phone · maps.apple.com/?q=ZIP+WA
The map link is tappable and opens navigation. The phone number is tap-to-call.
Show max 3 jobs. If 4+ say "+ X more not shown."
Calendar responses may use up to 450 characters — the extra room is only for job lists.
Example of one job line: "9am — AC Repair · John S · (206)555-1234 · maps.apple.com/?q=98004+WA"`;

  // ── Tools ──────────────────────────────────────────────────────────────────
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
      description: 'Block time on the contractor calendar. Use when contractor says they have an outside job or need to hold time.',
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
      description: 'Cancel a booked appointment. Homeowner gets a rebook link automatically.',
      input_schema: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment ID from the list above' },
        },
        required: ['appointment_id'],
      },
    },
    {
      name: 'log_job_outcome',
      description: 'Log whether a completed job closed and for how much. Use when contractor replies to a post-appointment check-in with YES $amount or NO.',
      input_schema: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment ID of the completed job' },
          did_close: { type: 'boolean', description: 'true if the job closed, false if not' },
          closed_value: { type: 'number', description: 'Dollar amount if closed (e.g. 850). Omit or null if did_close is false.' },
        },
        required: ['appointment_id', 'did_close'],
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
    max_tokens: 300,
    system: systemPrompt,
    tools,
    messages,
  });

  // ── Tool use loop ───────────────────────────────────────────────────────────
  const toolMessages = [...messages];
  const twilioClient = getTwilioClient();

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

        // Fire specialty messages after key steps — 3 second delay so main reply arrives first
        if (step_key === 'availability' && !contractor.sms_power_message_sent && twilioClient) {
          await db.query('UPDATE contractors SET sms_power_message_sent = 1 WHERE id = $1', [contractorId]);
          setTimeout(() => sendPowerMessage(contractor, twilioClient).catch(err =>
            console.error('[SMS-AI] Power message failed:', err.message)
          ), 3000);
        }
        if (step_key === 'twilio' && !contractor.sms_calendar_training_sent && twilioClient) {
          await db.query('UPDATE contractors SET sms_calendar_training_sent = 1 WHERE id = $1', [contractorId]);
          setTimeout(() => sendCalendarTrainingMessage(contractor, twilioClient).catch(err =>
            console.error('[SMS-AI] Calendar training message failed:', err.message)
          ), 3000);
          // Capabilities guide fires 9s after main reply so all 3 messages arrive in sequence
          const capCheck = await db.query('SELECT sms_capabilities_sent FROM contractors WHERE id = $1', [contractorId]);
          if (!capCheck.rows[0]?.sms_capabilities_sent) {
            await db.query('UPDATE contractors SET sms_capabilities_sent = 1 WHERE id = $1', [contractorId]);
            setTimeout(() => sendCapabilitiesGuide(contractor, twilioClient).catch(err =>
              console.error('[SMS-AI] Capabilities guide failed:', err.message)
            ), 9000);
          }
        }
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

    } else if (name === 'log_job_outcome') {
      try {
        const { appointment_id, did_close, closed_value } = input;
        await db.query(
          `UPDATE appointments SET did_close = $1, closed_value = $2 WHERE id = $3 AND contractor_id = $4`,
          [did_close ? 1 : 0, closed_value || null, appointment_id, contractorId]
        );
        if (did_close) {
          toolResult = `Job outcome logged — closed at $${closed_value || '(no amount)'}`;
        } else {
          toolResult = `Job outcome logged — did not close.`;
        }
        console.log(`[SMS-AI] Logged job outcome for appointment ${appointment_id}: closed=${did_close}, value=${closed_value}`);
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] log_job_outcome error:', err.message);
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
    || "Got it! Text me anytime or log in at tractifyhq.com/contractor.";

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

// ── Welcome text ── fires when Twilio number is first assigned ────────────────
async function sendWelcomeText(contractor, twilioClient) {
  const firstName = (contractor.name || '').split(' ')[0] || 'there';

  const body = `Hey ${firstName}! Your Tractify pipeline is live. Two things get the jobs flowing — I'll walk you through them. You can also text me anytime: "what's on my calendar" or "block Tuesday 3pm". Ready? Reply YES. Reply STOP to opt out.`;

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

// ── Power message ── fires after step 1 (availability) confirmed ──────────────
// Makes the calendar management capability feel like unlocking a superpower.
// Drives the first test reply — product becomes real the moment they get an answer.
async function sendPowerMessage(contractor, twilioClient) {
  const firstName = (contractor.name || '').split(' ')[0] || 'there';

  const body = `By the way ${firstName} — this number is your direct line to your whole calendar. Try it: text "what's on my calendar tomorrow" or "block Wednesday 2-5pm". It all updates automatically. This is how you run everything.`;

  await twilioClient.messages.create({
    to: contractor.phone,
    from: contractor.twilio_number,
    body,
  });

  console.log(`[SMS-AI] Power message sent to ${contractor.name} (${contractor.id})`);
}

// ── Calendar blocking training ── fires after step 2 (twilio) confirmed ───────
// Critical: must arrive BEFORE the first job lands or double-bookings happen.
async function sendCalendarTrainingMessage(contractor, twilioClient) {
  const body = `One more thing before jobs start coming in — any job you book outside Tractify (referrals, direct calls, word of mouth) just text me: "block Thursday 10am to 2pm". I'll hold it instantly so nobody double-books you.`;

  await twilioClient.messages.create({
    to: contractor.phone,
    from: contractor.twilio_number,
    body,
  });

  console.log(`[SMS-AI] Calendar blocking training sent to ${contractor.name} (${contractor.id})`);
}

// ── Capabilities guide ── fires after both required steps are done ────────────
// The full "here's everything you can do" message. Makes the SMS interface feel
// like a superpower they just unlocked. Arrives as a 3rd text after twilio step.
async function sendCapabilitiesGuide(contractor, twilioClient) {
  const body = `Here's everything you can do from this number: "jobs today" → your schedule with map links · "block Tue 10am-2pm" → holds that time · "cancel my 3pm Thu" → done, they get a rebook link · "how many jobs this week" → your count. Text me anything, anytime.`;

  await twilioClient.messages.create({
    to: contractor.phone,
    from: contractor.twilio_number,
    body,
  });

  console.log(`[SMS-AI] Capabilities guide sent to ${contractor.name} (${contractor.id})`);
}

// ── Post-appointment check-in ── called from cron 30-90 min after appointment ─
async function sendPostAppointmentText(appointment, contractor, twilioClient) {
  const firstName = (contractor.name || '').split(' ')[0] || 'there';
  const homeownerName = appointment.lead_name || 'your customer';
  const apptTime = fmtTime(appointment.scheduled_time);

  const body = `Hey ${firstName} — how'd your ${apptTime} go with ${homeownerName}? Did the job close? Reply YES $amount (like YES $850) or just NO.`;

  await twilioClient.messages.create({
    to: contractor.phone,
    from: contractor.twilio_number,
    body,
  });

  await db.query(
    `UPDATE appointments SET post_job_sms_sent_at = NOW() WHERE id = $1`,
    [appointment.id]
  );

  console.log(`[SMS-AI] Post-job check-in sent — appointment ${appointment.id} (${contractor.name})`);
}

// ── Send a proactive setup step text (drip cron) ──────────────────────────────
async function sendSetupStepText(contractor, twilioClient) {
  const completedSteps = typeof contractor.onboarding_steps === 'string'
    ? JSON.parse(contractor.onboarding_steps || '{}')
    : (contractor.onboarding_steps || {});

  // Required steps first (2), then the 5 channel steps
  const STEP_ORDER = ['availability', 'twilio', 'gbp', 'nextdoor', 'facebook', 'reviewers', 'messenger'];
  const nextIncomplete = STEP_ORDER.find(k => !completedSteps[k]);
  if (!nextIncomplete) return null;

  const bookingLink = contractor.booking_slug
    ? `https://tractifyhq.com/schedule/${contractor.booking_slug}`
    : 'https://tractifyhq.com/schedule';

  const firstName = (contractor.name || '').split(' ')[0] || 'there';
  const twilioNum = contractor.twilio_number;

  // Each message names the channel, states the cost of skipping it,
  // and makes the action feel like a 60-second win.
  const STEP_TEXTS = {
    availability: `${firstName}, step 1 of 2 — your hours were pre-set from your form. Log in at tractifyhq.com/contractor and confirm they look right. Takes 30 seconds. Reply DONE when you've checked.`,

    twilio: `Step 2 of 2 — the big one. Right now when you miss a call on a job, that homeowner calls your competitor. Forward unanswered calls to ${twilioNum} and we auto-text every missed caller a booking link. iPhone: Settings > Phone > Call Forwarding > When Unanswered > enter ${twilioNum} > on. Reply DONE when set.`,

    gbp: `Good news — your Google listing is already getting search traffic. But right now there's no Book button. Homeowners searching "HVAC near me" can see you but can't book. 60 seconds to fix: business.google.com > Edit Profile > Appointments > paste this: ${bookingLink} > Save. Reply DONE.`,

    nextdoor: `Homeowners in your area post "anyone know a good contractor?" on Nextdoor every single day. One post from you puts your booking link in front of neighbors who already trust their neighbors. Text COPY and I'll send you the exact post — takes 2 minutes.`,

    facebook: `Facebook community groups are full of homeowners asking for contractor recommendations right now. Text COPY and I'll send the exact post to paste — 2 minutes, could bring your next booking.`,

    reviewers: `Your past Google reviewers already trust you — they paid you and left 5 stars. Reaching out to them is the fastest free channel we have. Text COPY for the exact message to send each one.`,

    messenger: `Last channel — homeowners DM contractors on Facebook and Instagram constantly and never hear back. Set up an auto-reply that sends your booking link to every DM, 24/7. Text COPY for the reply text to paste in.`,
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

module.exports = {
  handleContractorSms,
  sendSetupStepText,
  sendWelcomeText,
  sendPowerMessage,
  sendCalendarTrainingMessage,
  sendCapabilitiesGuide,
  sendPostAppointmentText,
};
