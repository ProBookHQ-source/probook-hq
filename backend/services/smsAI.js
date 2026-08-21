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

// Formats a raw phone string (+12065551234, 2065551234, etc) as (206) 555-1234
// for anything shown to a human. Never show a raw E.164 string to a contractor.
function fmtPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Formats availability slots into a compact SMS-readable string
// e.g. "Mon 8:00 AM-5:00 PM, Tue 8:00 AM-5:00 PM, ..."
function formatAvailabilityForSms(slots) {
  if (!slots.length) return 'No hours loaded yet';
  const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return slots.map(s => `${DAYS_SHORT[s.day_of_week]} ${fmtTime(s.start_time)}-${fmtTime(s.end_time)}`).join(', ');
}

function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  return require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ── Step guide definitions ───────────────────────────────────────────────────
// Extracted to module scope (was previously inline inside buildSystemPrompt)
// so it has exactly one source of truth, reusable by anything that needs to
// know "what's the next incomplete step" — not just the AI's own system
// prompt. This is what getNextStepPromptForContractor() below calls into, so
// that a completion notification fired from OUTSIDE handleContractorSms (e.g.
// forwardingTest.js's notifyResult, which texts a contractor directly via the
// Twilio API after an automated background test resolves, with no AI/model
// involved at all) can still prompt the real next step instead of just
// stopping — a real bug found live: the forwarding test passed, the
// congratulations text went out, and the contractor was left with no idea
// they still had 4 more steps to go until they thought to ask.
function buildStepGuides(liveContractor, completedSteps, bookingLink, twilioNumber, hasBusinessPhoneAnswer) {
  return {
    // Added because it was a real gap left over from the pivot away from the old
    // 4-step intake form: that form used to collect an explicit list of service-area
    // zip codes, and the new single-screen signup form was designed to replace it
    // with automatic geocode+radius derivation "later" — that derivation was never
    // actually built anywhere in the codebase. Every contractor created through the
    // current signup flow got service_zip_codes hardcoded to the wildcard ["*"],
    // which makes isInServiceArea() in homeownerSmsAI.js always return true — Brain 3
    // will accept a booking from literally any address, anywhere, with zero distance
    // check. This step is the fix: ask for it over text instead of building the
    // geocode/radius machinery. Placed first, before availability, since it's what
    // actually gates whether a booking should be accepted at all.
    service_area: {
      label: 'Confirm your service area',
      done: !!completedSteps.service_area,
      guide: `Ask them to text every zip code they service, separated by commas or spaces (example: "98004, 98005, 98052"). Once they reply with real zip codes, call set_service_zip_codes with the list — do not guess zip codes yourself. If they don't know their exact zips, ask them to list the zip codes they're comfortable driving to. If they say they have no fixed area and will "go anywhere," don't take that as unlimited — ask "about how many miles from your shop are you willing to drive?" and call set_service_zip_codes with no_limit=true AND radius_miles set to that number. Never call no_limit=true without also getting a real radius_miles from them first.`,
    },
    availability: {
      label: 'Confirm your schedule',
      done: !!completedSteps.availability,
      guide: `Their hours are shown in the REGULAR SCHEDULE section above. You must actually state those hours out loud in your message and ask "does that look right?" — do NOT mark this step done just because they said "yes" to something else earlier (like the welcome text). Only mark it done when they say yes to a message where YOU just read their hours back to them. If they want changes, ask them to text the specific change and update via update_availability_slot.`,
    },
    twilio: {
      label: 'Set up missed call forwarding',
      done: !!completedSteps.twilio,
      guide: hasBusinessPhoneAnswer
        ? `First ask: iPhone or Android, AND which carrier (AT&T, T-Mobile, Verizon, or other)? Then give the CORRECT device+carrier-specific steps for TRUE conditional (no-answer-only) forwarding — NEVER the plain Settings toggle, which forwards ALL calls immediately with zero rings and would break their phone line. iPhone has no true "forward when unanswered" option in Settings — it must be done with a carrier code dialed like a phone call, and the code is DIFFERENT per carrier: AT&T/T-Mobile use **61*${twilioNumber}*11*20# then press the green call button (it will connect briefly then hang up on its own — that's normal, it means it worked). Verizon uses a simpler code: *71${twilioNumber} then press call. To turn OFF forwarding later if anything seems wrong: AT&T/T-Mobile dial ##61# then call, Verizon dial *73 then call. Android: Phone app > 3-dot menu > Settings > Calling accounts (or Supplementary services) > Call forwarding > "When unanswered" > enter ${twilioNumber} > turn on — this IS a true conditional option built into Android's own Settings, no dial code needed. Always tell them to tap and hold the number in your text to copy it instead of retyping it. If they're on iPhone and running iOS 17 or newer, mention that the "Live Voicemail" feature can silently block conditional forwarding from working — if forwarding doesn't seem to catch missed calls after setup, tell them to check Settings > Phone > Live Voicemail and turn it off. IMPORTANT — do NOT ask them to test it themselves by calling from a second phone. Once they say they've dialed the code / turned it on, tell them "Give me about a minute, I'm going to test that myself" and immediately call the run_forwarding_test tool — Tractify places a real test call and texts them the result automatically (and marks this step done automatically if it passes). Do not mark the step done yourself and do not ask them to text DONE again unless the test comes back showing a problem.`
        : `First find out: is ${liveContractor.phone} the number their customers actually call, or is their business line different? If they say it's the same, call set_business_phone with is_same=true. If they give a different number, call set_business_phone with that number. Do NOT give any forwarding code or instructions yourself here — once set_business_phone runs, you will immediately get the correct detailed guide (with the real carrier codes) for your very next message, so just confirm the number back to them and continue straight into asking device + carrier, exactly as that guide says.`,
    },
    gbp: {
      label: 'Add booking link to Google Business Profile',
      done: !!completedSteps.gbp,
      guide: `Go to business.google.com > Edit Profile > scroll to Appointments > paste this link: ${bookingLink} > Save. Text DONE when done.`,
    },
    facebook: {
      label: 'Post in a local Facebook group',
      done: !!completedSteps.facebook,
      guide: `Search Facebook for your city + "neighbors" or "community" groups. Post: "Hi everyone! I run ${liveContractor.company_name || liveContractor.name} and just launched online booking. No phone tag — just pick a time: ${bookingLink}." Text DONE when posted.`,
    },
    reviewers: {
      label: 'Message your Google reviewers',
      done: !!completedSteps.reviewers,
      guide: `Go to business.google.com > Reviews > click Reply next to each review. Send: "Hi [Name]! Thanks for the review. We just launched online booking — book anytime here: ${bookingLink}. Hope we can help again!" Text DONE when sent.`,
    },
    messenger: {
      label: 'Set up Messenger + Instagram auto-reply',
      done: !!completedSteps.messenger,
      guide: `Go to business.facebook.com > Inbox > Automation > Instant Replies > toggle on > paste: "Thanks for reaching out to ${liveContractor.company_name || liveContractor.name}! Book a time here: ${bookingLink} — takes 60 seconds." > Save. Text DONE when done.`,
    },
  };
}

// Fetches fresh contractor state and returns { label, guide } for the next
// incomplete onboarding step, or null if everything's done. Used by anything
// OUTSIDE the normal AI conversation loop (currently: forwardingTest.js's
// notifyResult) that needs to tell a contractor what's next after marking a
// step done itself, without going through handleContractorSms.
async function getNextStepPromptForContractor(contractorId) {
  const freshRow = await db.prepare(
    'SELECT onboarding_steps, business_phone, twilio_number, booking_slug, company_name, name, phone, service_zip_codes FROM contractors WHERE id = $1'
  ).get(contractorId);
  if (!freshRow) return null;

  const completedSteps = typeof freshRow.onboarding_steps === 'string'
    ? JSON.parse(freshRow.onboarding_steps || '{}')
    : (freshRow.onboarding_steps || {});

  const bookingLink = freshRow.booking_slug
    ? `https://tractifyhq.com/schedule/${freshRow.booking_slug}`
    : 'https://tractifyhq.com/schedule';
  const twilioNumber = freshRow.twilio_number || '(not assigned yet)';
  const hasBusinessPhoneAnswer = !!freshRow.business_phone;

  const STEP_GUIDES = buildStepGuides(freshRow, completedSteps, bookingLink, twilioNumber, hasBusinessPhoneAnswer);
  const nextStep = Object.entries(STEP_GUIDES).find(([, s]) => !s.done);
  return nextStep ? { label: nextStep[1].label, guide: nextStep[1].guide } : null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleContractorSms(contractor, incomingText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[SMS-AI] No ANTHROPIC_API_KEY set — skipping AI reply');
    return "I'm having a little trouble right now — give me a few minutes and text me again.";
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
        const phone = a.lead_phone ? ` · ${fmtPhone(a.lead_phone)}` : '';
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

  // ── System prompt builder ────────────────────────────────────────────────────
  // A function, not a one-time const, because it must be called AGAIN after every
  // tool call inside the loop below — not just once at the top of the turn.
  //
  // Real bug found live (Aug 20, 2026): a contractor answered the call-forwarding
  // step's "same number or different?" question, the AI correctly called
  // set_business_phone mid-turn, but the system prompt handed to the NEXT model
  // call in that same turn was still the one built at the very start — before
  // business_phone existed — so the detailed carrier-specific forwarding guide
  // (which only unlocks once business_phone is set) never actually reached the
  // model that turn. It fell through to the vague fallback wording and
  // improvised a wrong dial code and the wrong destination number from general
  // knowledge instead. Re-fetching fresh state and rebuilding the prompt after
  // every tool call closes that gap — whatever a tool just wrote to the DB
  // (business_phone, onboarding_steps, availability_slots) is reflected in the
  // very next model call, same turn, not one turn behind.
  async function buildSystemPrompt() {
    const freshRow = await db.prepare(
      'SELECT onboarding_steps, business_phone, twilio_number, booking_slug, company_name, name, phone, service_zip_codes FROM contractors WHERE id = $1'
    ).get(contractorId);
    const liveContractor = { ...contractor, ...(freshRow || {}) };

    const freshSlotsResult = await db.query(
      'SELECT * FROM availability_slots WHERE contractor_id = $1 ORDER BY day_of_week',
      [contractorId]
    );
    const liveScheduleText = freshSlotsResult.rows.length
      ? freshSlotsResult.rows.map(s => `${DAYS[s.day_of_week]}: ${fmtTime(s.start_time)}-${fmtTime(s.end_time)}`).join(', ')
      : 'No schedule set';

    const completedSteps = typeof liveContractor.onboarding_steps === 'string'
      ? JSON.parse(liveContractor.onboarding_steps || '{}')
      : (liveContractor.onboarding_steps || {});

    const bookingLink = liveContractor.booking_slug
      ? `https://tractifyhq.com/schedule/${liveContractor.booking_slug}`
      : 'https://tractifyhq.com/schedule';

    const twilioNumber = liveContractor.twilio_number || '(not assigned yet)';
    const hasTwilioNumber = !!liveContractor.twilio_number;

  // business_phone is NULL until the twilio step resolves whether customers call the
  // same cell number we collected at signup or a separate business line. Once resolved
  // (even to "same"), business_phone holds the number to actually forward — either a
  // confirmed-different number, or contractor.phone itself if they confirmed it's the same.
  const hasBusinessPhoneAnswer = !!liveContractor.business_phone;
  const businessNumberForForwarding = liveContractor.business_phone || liveContractor.phone;

  const STEP_GUIDES = buildStepGuides(liveContractor, completedSteps, bookingLink, twilioNumber, hasBusinessPhoneAnswer);

  const incompleteSteps = Object.entries(STEP_GUIDES).filter(([, s]) => !s.done);
  const completedCount = Object.values(STEP_GUIDES).filter(s => s.done).length;
  const totalSteps = Object.keys(STEP_GUIDES).length;
  const nextStep = incompleteSteps[0];

    const todayName = DAYS[new Date().getDay()];
    // Post-pivot the intake form no longer collects a separate personal contact
    // name — contractor.name and contractor.company_name are both just the
    // business name (e.g. "Roofing Guys"). Never split this to fake a first
    // name ("Hey Roofing") — address them plainly instead.
    const businessName = liveContractor.company_name || liveContractor.name || 'there';

  // ── System prompt ───────────────────────────────────────────────────────────
  const systemPrompt = `You are the Tractify assistant texting with the owner of ${businessName}. There is no separate personal name on file — never invent one or address them by a fragment of the business name. You communicate via SMS — short, conversational, no bullet points, no markdown, no asterisks, no numbered lists. Write like a real text message.

CONTRACTOR:
  Business: ${businessName}
  Booking link: ${bookingLink}
  Today: ${todayName}, ${today}

SETUP PROGRESS (${completedCount}/${totalSteps} channels active):
${Object.entries(STEP_GUIDES).map(([k, s]) => `  [${s.done ? 'done' : 'todo'}] ${s.label}`).join('\n')}
${nextStep ? `\nNext step: "${nextStep[1].label}"\nHow to guide them through it: ${nextStep[1].guide}` : '\nAll steps done!'}

UPCOMING APPOINTMENTS:
${apptText}${pastApptText}

REGULAR SCHEDULE:
${liveScheduleText}

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
- "Yes" or "done" only confirms the step YOU just described in your immediately-previous message. Never treat a generic yes (like a reply to "ready to start?") as confirming a specific thing (like their hours) that you haven't actually stated yet in this conversation. If you're not sure what they're saying yes to, ask.
- When they clearly confirm the specific thing you just asked about ("done", "yes", "ok", "finished", "set it up" in direct response to your instruction) — mark the current step complete immediately using complete_setup_step. EXCEPTION: the call-forwarding (twilio) step is NEVER marked done this way — see that step's guide for what to do instead (run_forwarding_test).
- After marking a step done: one short congratulations sentence, then IMMEDIATELY give the first instruction for the next incomplete step in the SAME message — don't just ask "ready to keep going?" and wait. Keep momentum, walk them straight into it.
- When guiding a step: give ONE clear instruction, end with "Reply DONE when set." Never assume they know a term or menu path — spell it out exactly, as if they've never done this before.
- Whenever you give them a phone number to use (for forwarding, calling, etc), tell them to tap and hold it to copy it rather than retyping it by hand.
- If they ask what's next, tell them just the next incomplete step.
- If all steps done: tell them all channels are live and jobs are coming.
- Calendar questions: reply with day, time, name — brief and clear.
- If they reply YES $amount or NO to a check-in about a past job — use log_job_outcome immediately.
- If a contractor seems stuck, confused, or asks "what do you mean" / "where do I go" — never just repeat the same instruction. Ask what they're actually seeing on their screen and walk them through it from there, or offer to explain it a different way.
- NEVER say "give me a second," "let me get that saved," "I'll have that ready shortly," or anything implying an action is in progress unless you are calling the matching tool in that exact same response. If a contractor gives you a full schedule correction covering multiple days, call update_availability_slot once for EVERY affected day in that same turn — do not defer any of them to "next" and do not narrate that you're working on it across multiple messages. Either the tool call happens now, in this response, or say nothing implying it will.

CALENDAR RESPONSE FORMAT:
When they ask about jobs or their schedule, show each job on its own line:
Time — Service · Name · Phone · maps.apple.com/?q=ZIP+WA
The map link is tappable and opens navigation. The phone number is tap-to-call.
Show max 3 jobs. If 4+ say "+ X more not shown."
Calendar responses may use up to 450 characters — the extra room is only for job lists.
Example of one job line: "9am — AC Repair · John S · (206)555-1234 · maps.apple.com/?q=98004+WA"`;

    return systemPrompt;
  } // end buildSystemPrompt()

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
            enum: ['service_area', 'availability', 'twilio', 'gbp', 'facebook', 'reviewers', 'messenger'],
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
    {
      name: 'set_business_phone',
      description: 'Record which number customers actually call, as part of the call-forwarding setup step. Use this BEFORE giving forwarding instructions — it determines which number to forward. Call it whether they confirm it is the same number or give you a different one.',
      input_schema: {
        type: 'object',
        properties: {
          is_same: {
            type: 'boolean',
            description: 'true if customers call the same personal cell number already on file. false if they gave a different business number.',
          },
          different_number: {
            type: 'string',
            description: 'The separate business phone number, in any reasonable format, if is_same is false. Omit if is_same is true.',
          },
        },
        required: ['is_same'],
      },
    },
    {
      name: 'set_service_zip_codes',
      description: 'Save the list of zip codes this contractor services, as part of the service-area setup step. Call this once you have real 5-digit zip codes from them. If they say they have no fixed zip list and will "go anywhere," that still needs a real mile radius from their business address — ask "about how many miles from your shop are you willing to drive?" and pass that as radius_miles along with no_limit=true. Never call no_limit=true without a radius_miles number — an unbounded service area would let someone in another state book them.',
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
            description: 'true ONLY if they explicitly said they have no fixed zip list / will travel anywhere. Requires radius_miles to also be set — do not call with no_limit true and radius_miles missing.',
          },
          radius_miles: {
            type: 'number',
            description: 'How many miles from their business address they are willing to travel. Required whenever no_limit is true. Ask them directly for this number — never guess it.',
          },
        },
        required: [],
      },
    },
    {
      name: 'run_forwarding_test',
      description: 'Test whether call forwarding is actually set up correctly, by having Tractify place a real test call to the contractor\'s own number. Use this the moment the contractor says they\'ve dialed the forwarding code / turned on the toggle — do NOT ask them to test it themselves by calling from another phone, Tractify tests it automatically now. Do not mark the twilio step done yourself — the test result (sent as a separate text within about a minute) marks it done automatically if it passes.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'update_availability_slot',
      description: 'Update a recurring weekly availability slot — use when a contractor wants to change their regular hours for a day, or mark a day as unavailable. Do NOT use for one-off date blocks (use block_time for those).',
      input_schema: {
        type: 'object',
        properties: {
          day_of_week: {
            type: 'number',
            description: '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday',
          },
          start_time: {
            type: 'string',
            description: 'Start time in HH:MM 24-hour format, e.g. "09:00". Required if is_active is true.',
          },
          end_time: {
            type: 'string',
            description: 'End time in HH:MM 24-hour format, e.g. "17:00". Required if is_active is true.',
          },
          is_active: {
            type: 'boolean',
            description: 'true to set hours for this day, false to mark the day as unavailable (closed).',
          },
        },
        required: ['day_of_week', 'is_active'],
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
    system: await buildSystemPrompt(),
    tools,
    messages,
  });

  // ── Tool use loop ───────────────────────────────────────────────────────────
  // IMPORTANT: Claude can return MULTIPLE tool_use blocks in a single response.
  // Every tool_use block must get a matching tool_result in the very next message,
  // or the Anthropic API rejects the whole request with a 400 (this was a real
  // production bug — see Sentry 5b5194f4, session 28). We loop over ALL tool_use
  // blocks in the response and resolve every one before calling the API again.
  const toolMessages = [...messages];
  const twilioClient = getTwilioClient();

  while (response.stop_reason === 'tool_use') {
    const toolBlocks = response.content.filter(b => b.type === 'tool_use');
    if (!toolBlocks.length) break;

    const toolResultBlocks = [];

    for (const toolBlock of toolBlocks) {
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
            // Postgres unique-violation error text is "duplicate key value violates
            // unique constraint ..." — it never contains the literal string "UNIQUE"
            // (that's a SQLite-ism). This app runs on Postgres (pg/db.js), so this
            // check never matched a real conflict — every genuine overlap re-threw
            // and aborted the rest of the multi-hour block loop instead of being
            // silently skipped as intended. Every other conflict check in this
            // codebase (bookings.js, homeownerSmsAI.js) correctly uses err.code ===
            // '23505' — matching that pattern here.
            if (e.code !== '23505') throw e;
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

    } else if (name === 'set_business_phone') {
      try {
        const { is_same, different_number } = input;
        const resolvedNumber = is_same ? contractor.phone : (different_number || '').trim();
        if (!resolvedNumber) {
          toolResult = `Error: no number to save — ask them for the business number and try again.`;
        } else {
          await db.query(`UPDATE contractors SET business_phone = $1 WHERE id = $2`, [resolvedNumber, contractorId]);
          toolResult = is_same
            ? `Confirmed same number — ${resolvedNumber} is what gets forwarded. Now give the forwarding instructions for that number.`
            : `Saved separate business number ${resolvedNumber}. Now give the forwarding instructions for THAT number, not their personal cell.`;
          console.log(`[SMS-AI] business_phone set for ${contractorId}: ${resolvedNumber} (same=${is_same})`);
        }
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] set_business_phone error:', err.message);
      }

    } else if (name === 'set_service_zip_codes') {
      try {
        const { zip_codes, no_limit, radius_miles } = input;
        let toSave = null;
        let radiusToSave = null;
        let humanSummary = '';

        if (no_limit) {
          // "I'll go anywhere" still needs a real mile radius from the contractor's
          // own business address — without one this would mean literally unlimited
          // (someone in another state could text in and book), which is the exact
          // bug this whole step was built to close. Never save an unbounded wildcard.
          const radiusNum = Number(radius_miles);
          if (!radius_miles || !Number.isFinite(radiusNum) || radiusNum <= 0) {
            toolResult = `Error: no_limit requires a real mile radius. Ask them "about how many miles from your shop are you willing to drive?" and call this again with radius_miles set.`;
          } else {
            toSave = ['*'];
            radiusToSave = Math.round(radiusNum);
            humanSummary = `no fixed zip list, bounded to a ${radiusToSave}-mile radius from their business address`;
          }
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
          if (!toolResult) {
            toolResult = `Error: no valid 5-digit zip codes found in that reply — ask them to text the zip codes again, digits only, separated by commas or spaces.`;
          }
        } else {
          // This is the fix for a real gap left over from the pivot: the old intake
          // form used to collect service-area zip codes explicitly, the new
          // single-screen form dropped that field, and the "derive it automatically
          // from the geocoded address" replacement was never actually built —
          // every contractor since the pivot has had service_zip_codes hardcoded
          // to the wildcard ["*"], which made Brain 3's isInServiceArea() check
          // a no-op that accepted a booking from any address, anywhere. Saving a
          // real list (or a wildcard + real radius) here is what actually turns
          // that check back on.
          if (radiusToSave) {
            await db.query(`
              UPDATE contractors
              SET service_zip_codes = $1,
                  service_radius_miles = $2,
                  onboarding_steps = COALESCE(onboarding_steps, '{}'::jsonb) || '{"service_area": true}'::jsonb,
                  onboarding_started_at = COALESCE(onboarding_started_at, NOW())
              WHERE id = $3
            `, [JSON.stringify(toSave), radiusToSave, contractorId]);
          } else {
            await db.query(`
              UPDATE contractors
              SET service_zip_codes = $1,
                  onboarding_steps = COALESCE(onboarding_steps, '{}'::jsonb) || '{"service_area": true}'::jsonb,
                  onboarding_started_at = COALESCE(onboarding_started_at, NOW())
              WHERE id = $2
            `, [JSON.stringify(toSave), contractorId]);
          }
          toolResult = `Saved service area: ${humanSummary}. Step marked complete — move on to the next step.`;
          console.log(`[SMS-AI] service_zip_codes set for ${contractorId}: ${humanSummary}`);
        }
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] set_service_zip_codes error:', err.message);
      }

    } else if (name === 'run_forwarding_test') {
      try {
        const { startForwardingTest } = require('./forwardingTest');
        const result = await startForwardingTest(contractor);
        if (result.started) {
          toolResult = `Test call placed. Tell the contractor you're testing it now and they'll get a text with the result in under a minute — no further action needed from them right now.`;
        } else if (result.reason === 'missing_number') {
          toolResult = `Error: no phone number on file to test — resolve set_business_phone first.`;
        } else {
          toolResult = `Error starting test: ${result.reason}. Tell the contractor to just text DONE again in a minute and you'll retry.`;
        }
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] run_forwarding_test error:', err.message);
      }

    } else if (name === 'update_availability_slot') {
      try {
        const { day_of_week, start_time, end_time, is_active } = input;
        const dayName = DAYS[day_of_week] || `day ${day_of_week}`;
        // Remove existing slot(s) for this day first, then insert if active
        await db.query(
          `DELETE FROM availability_slots WHERE contractor_id = $1 AND day_of_week = $2`,
          [contractorId, day_of_week]
        );
        if (is_active && start_time && end_time) {
          await db.query(
            `INSERT INTO availability_slots (contractor_id, day_of_week, start_time, end_time, is_active)
             VALUES ($1, $2, $3, $4, 1)`,
            [contractorId, day_of_week, start_time, end_time]
          );
          toolResult = `Updated ${dayName} to ${fmtTime(start_time)}-${fmtTime(end_time)}.`;
        } else {
          toolResult = `Marked ${dayName} as unavailable.`;
        }
        console.log(`[SMS-AI] Updated availability slot — ${dayName} for contractor ${contractorId}`);
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] update_availability_slot error:', err.message);
      }

    } else {
      toolResult = `Unknown tool: ${name}`;
    }

    toolResultBlocks.push({ type: 'tool_result', tool_use_id: toolUseId, content: toolResult });
    } // end for-each toolBlock

    toolMessages.push({ role: 'assistant', content: response.content });
    toolMessages.push({ role: 'user', content: toolResultBlocks });

    // Rebuild the system prompt fresh — a tool call above (set_business_phone,
    // complete_setup_step, update_availability_slot, etc) may have just changed
    // exactly what the next-step guide should say. Reusing the prompt built at
    // the top of this turn is the bug that produced a wrong call-forwarding
    // code and wrong destination number in live testing — see the comment on
    // buildSystemPrompt() above.
    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: await buildSystemPrompt(),
      tools,
      messages: toolMessages,
    });
  }

  const reply = response.content.find(b => b.type === 'text')?.text
    || "Got it! Give me just a second and text me again if you don't hear back shortly.";

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
  const businessName = contractor.company_name || contractor.name || 'there';

  const body = `Hey — this is Tractify for ${businessName}. Your booking system is live. Two quick things and jobs start coming in automatically. Ready to knock them out? Reply YES to start. Reply STOP to opt out.`;

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
  const body = `Quick heads up — this number does more than setup. Text me "what's on my calendar tomorrow" right now and I'll read it back in 10 seconds. Text "block Wednesday 2-5pm" and it's held. Try it.`;

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
  const body = `Before the first jobs hit — if you book something direct (referral, repeat customer, phone call) just text me the time, like "block Thursday 10am to 2pm." I'll block that time off right away so no one else can book it through us. If you skip this, someone could book that same slot through Tractify and you'd end up double-booked.`;

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
  const body = `Quick cheat sheet — just text me any of these anytime. "jobs today" sends your schedule, and each job comes with a link you can tap to open turn-by-turn directions straight to that address. "block Tue 10am-2pm" holds that time on your calendar so nobody else can book it. "cancel my 3pm Thu" cancels that job and automatically texts the homeowner a link to pick a new time. "how many jobs this week" gives you a quick count. Text me anything, anytime.`;

  await twilioClient.messages.create({
    to: contractor.phone,
    from: contractor.twilio_number,
    body,
  });

  console.log(`[SMS-AI] Capabilities guide sent to ${contractor.name} (${contractor.id})`);
}

// ── Post-appointment check-in ── called from cron 30-90 min after appointment ─
async function sendPostAppointmentText(appointment, contractor, twilioClient) {
  const homeownerName = appointment.lead_name || 'your customer';
  const apptTime = fmtTime(appointment.scheduled_time);

  const body = `Hey — how'd the ${apptTime} with ${homeownerName} go? Job close? Reply YES $850 (or whatever you got) or just NO. 5 seconds.`;

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

  // Required steps first (2), then the remaining channel steps
  const STEP_ORDER = ['service_area', 'availability', 'twilio', 'gbp', 'facebook', 'reviewers', 'messenger'];
  const nextIncomplete = STEP_ORDER.find(k => !completedSteps[k]);
  if (!nextIncomplete) return null;

  const bookingLink = contractor.booking_slug
    ? `https://tractifyhq.com/schedule/${contractor.booking_slug}`
    : 'https://tractifyhq.com/schedule';

  const twilioNum = contractor.twilio_number;

  // For the availability step, pull their hours from DB and show them in the text
  // so the contractor never has to log into the portal to confirm.
  let availabilityText = '';
  if (nextIncomplete === 'availability') {
    const slotsResult = await db.query(
      'SELECT * FROM availability_slots WHERE contractor_id = $1 ORDER BY day_of_week',
      [contractor.id]
    );
    availabilityText = formatAvailabilityForSms(slotsResult.rows);
  }

  // Each message names the channel, states the cost of skipping it,
  // and makes the action feel like a 60-second win — no portal login required.
  const STEP_TEXTS = {
    service_area: `Step 1 of 3. Quick one — what zip codes do you actually service? Text them over separated by commas or spaces (like "98004, 98005, 98052"). This is how we make sure we only book you jobs you can actually get to.`,

    availability: `Step 2 of 3. Here are the hours we have on file for you: ${availabilityText}. Does that match your real schedule? Reply YES if that's correct, or just tell me what to change (like "Tuesdays I close at 3pm") and I'll fix it.`,

    twilio: contractor.business_phone
      ? `Step 3 of 3. Every call you miss on a job — that homeowner is already calling your competitor. We can fix that, but the exact steps depend on your phone and carrier. Are you on an iPhone or Android, and is your carrier AT&T, T-Mobile, Verizon, or something else?`
      : `Step 3 of 3. Quick one first — is ${contractor.phone} the number your customers actually call, or is your business line different? Once I know which number, I'll send the exact forwarding steps so every missed call gets caught automatically.`,

    gbp: `Good news — your Google listing is already getting search traffic. But right now there's no Book button. Homeowners searching "HVAC near me" can see you but can't book. 60 seconds to fix: business.google.com > Edit Profile > Appointments > paste this link: ${bookingLink} > Save. Reply DONE when it's saved.`,

    facebook: `Every local Facebook group has homeowners asking for contractor recommendations right now. The ones that respond fastest get the job. Text COPY and I'll send the exact post to paste — 2 minutes.`,

    reviewers: `Your Google reviewers paid you, loved you, and left proof. They're your warmest leads — they'll book again or refer a neighbor. Text COPY and I'll send the exact message to send each one. Free channel, highest trust.`,

    messenger: `Last one. Homeowners DM contractors on Facebook and Instagram, don't hear back, and hire whoever responds. One-time auto-reply setup and every DM gets your booking link instantly, 24/7, without you touching it. Text COPY for the exact text to paste.`,
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
  getNextStepPromptForContractor,
};
