/**
 * smsAI.js — Two-way AI SMS assistant for contractors
 *
 * Three phases:
 *   Phase 1 — Activation (days 1-7): 2 required steps + specialty messages
 *   Phase 2 — Orientation: power message (after all 3 required steps done) + calendar blocking (after twilio step)
 *   Phase 3 — Ongoing loop: post-appointment close tracking, calendar management forever
 *
 * Exports:
 *   handleContractorSms        — inbound SMS handler
 *   sendSetupStepText          — drip cron: next incomplete step
 *   sendWelcomeText            — fires on first Twilio number assignment
 *   sendPowerMessage           — fires once the full checklist (all 7 steps) is done
 *   sendCalendarTrainingMessage — fires after step 2 (twilio) confirmed
 *   sendPostAppointmentText    — fires 30-90 min after appointment time
 */

const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const notifications = require('./notifications');
const { logEvent } = require('./auditLog');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Live-caught real bug (task #63): every deterministic send that fires OUTSIDE
// handleContractorSms's own loop — power message, calendar training, capabilities
// guide, proactive step drip texts, and forwarding-test result messages — was
// sent directly via twilioClient.messages.create() and never touched
// sms_conversation. Confirmed live: after the forwarding-test success message
// appended "Next up: [GBP step text]" and the contractor replied "Done", the AI
// had zero record the GBP step was ever asked — sms_conversation still ended
// wherever the last real handleContractorSms turn left off, so the "Done" reply
// had nothing to attach to and the conversation stalled with no response at all.
//
// Fix: a shared helper any deterministic sender can call right after texting the
// contractor, to append what was actually sent as a real turn. Persisted history
// always ends on an 'assistant' entry (every push in this file is a user+assistant
// pair, and sendWelcomeText seeds the same shape) — so appending a synthetic
// user note + the real assistant body as a pair keeps strict user/assistant
// alternation valid for the next handleContractorSms call, regardless of what
// came before. Safe to call unconditionally from anywhere, not just conversation[0].
async function appendDeterministicSmsTurn(contractorId, assistantBody, systemNote = '(system: automated message sent)') {
  try {
    const row = await db.prepare('SELECT sms_conversation FROM contractors WHERE id = $1').get(contractorId);
    const history = row && row.sms_conversation
      ? (typeof row.sms_conversation === 'string' ? JSON.parse(row.sms_conversation || '[]') : row.sms_conversation)
      : [];
    const updated = [
      ...history,
      { role: 'user', content: systemNote },
      { role: 'assistant', content: assistantBody },
    ].slice(-20);
    await db.query(`UPDATE contractors SET sms_conversation = $1::jsonb WHERE id = $2`, [JSON.stringify(updated), contractorId]);
  } catch (err) {
    console.error('[SMS-AI] appendDeterministicSmsTurn failed (non-fatal):', err.message);
  }
}

// Mirrors ContractorPortal.jsx's REQUIRED_STEP_KEYS — the "you do 3 things"
// promise. Still used for the calendar-training message trigger (fires right
// after the twilio step, which is genuinely relevant there) and elsewhere.
const REQUIRED_STEP_KEYS = ['service_area', 'availability', 'twilio'];

// Every onboarding step key, full checklist — mirrors the keys buildStepGuides
// defines. Used ONLY to decide when the power message fires: live-tested by
// Jose twice now. First pass fired it right after step 1 (availability),
// confusing a contractor mid-setup before call forwarding was even done —
// moved to fire after the 3 REQUIRED steps instead. That still wasn't right:
// twilio is usually the last required step but gbp/facebook/reviewers/
// messenger still remain after it, so the power message kept landing mid-
// flow — live-caught sandwiched confusingly between the facebook step's
// intro and its ready-to-paste copy. Jose: "this should be at the very end
// of set up." Now gated on the FULL checklist being done, not just required.
const ALL_STEP_KEYS = ['service_area', 'availability', 'twilio', 'gbp', 'facebook', 'reviewers', 'messenger'];

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
function buildStepGuides(liveContractor, completedSteps, bookingLink, twilioNumber, hasBusinessPhoneAnswer, liveScheduleText = 'No schedule set') {
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
      guide: `Start with why before asking — e.g. "Quick one — this makes sure we only ever send you jobs you can actually get to, nothing outside your area." Then ask them to text every zip code they service, separated by commas or spaces (example: "98004, 98005, 98052"). Once they reply with real zip codes, call set_service_zip_codes with the list — do not guess zip codes yourself. If they don't know their exact zips, ask them to list the zip codes they're comfortable driving to. If they say they have no fixed area and will "go anywhere," don't take that as unlimited — ask "about how many miles from your shop are you willing to drive?" and call set_service_zip_codes with no_limit=true AND radius_miles set to that number. Never call no_limit=true without also getting a real radius_miles from them first.`,
    },
    availability: {
      label: 'Confirm your schedule',
      done: !!completedSteps.availability,
      guide: liveScheduleText === 'No schedule set'
        ? `REGULAR SCHEDULE above shows "No schedule set" — we have no real hours on file for them (this happens when there was no Google listing to pull hours from). Do NOT invent or assume any hours. Ask for the WHOLE week in one message — e.g. "What are your hours Monday through Friday? Do you work weekends, and if so what hours?" — do not ask day by day one at a time, that's slower and wastes turns.

If they answer with anything like "24/7", "on call anytime", "always available", or similar — do NOT just save 00:00-23:59 and move on, and do NOT silently guess what they meant. "24/7" almost always means "I'll answer/respond to an emergency any hour," which is already fully automatic and needs zero setup here — missed-call catch and texting work at 3am the same as 3pm regardless of what's saved in this step. What THIS step actually controls is which hours homeowners can pick a SCHEDULED appointment time for. So ask one clarifying question distinguishing the two, e.g.: "Got it — you're always reachable for emergencies, that's already handled automatically, no setup needed there. For actual scheduled bookings someone picks a day/time for, do you want those bookable any hour too, or do you want scheduled jobs limited to certain hours and anything outside that treated as emergency-only?" Whatever they answer to THAT question is what gets saved via update_availability_slot — if they genuinely want any-hour bookable slots, save 00:00-23:59 for those days; if they want scheduled bookings limited to certain hours, save those specific hours instead.

If their answer covers every day clearly (even "closed Sundays, same hours every other day"), call update_availability_slot once per day (or "closed" via is_active=false) in that same turn to save all of it at once. Only ask about a specific day separately if their answer left something genuinely ambiguous or missing.

Before marking this step done, state the final hours you're about to save back to them in one message and get an explicit yes — e.g. "Just to confirm: closed Sun/Fri/Sat, Mon-Thu 9am-5pm bookable — that right?" Same rule as the branch below: only call complete_setup_step once they've confirmed the hours YOU just read back, not just because they answered the original question.`
        : `Start with a quick why — e.g. "Just confirming your hours so we only ever offer homeowners times you're actually available." Then their hours are shown in the REGULAR SCHEDULE section above — you must actually state those hours out loud in your message and ask "does that look right?" — do NOT mark this step done just because they said "yes" to something else earlier (like the welcome text). Only mark it done when they say yes to a message where YOU just read their hours back to them. If they want changes, ask them to text the specific change and update via update_availability_slot.`,
    },
    twilio: {
      label: 'Set up missed call forwarding',
      done: !!completedSteps.twilio,
      guide: hasBusinessPhoneAnswer
        ? `First ask device AND carrier together in ONE single message that leads with an explanation of what call forwarding actually does before asking anything — do not just motivate it, define the mechanism. e.g. "Here's how this works: when you miss a call, instead of it just ringing out, it'll forward to us and we'll text the caller right away so you don't lose the job. Every call you miss right now is a homeowner who might just call the next guy instead — let's get that covered. Are you on an iPhone or Android, and which carrier: AT&T, T-Mobile, Verizon, or something else?" Live-caught real bug: a version of this transition once said forwarding means "when someone books, their call reaches you instantly" — that's backwards and wrong. Forwarding only activates on a call YOU miss, and it goes to US (not to them), so we can catch it and still get them booked. Never describe it any other way. Do NOT ask "iPhone or Android?" and then wait for a reply before asking carrier separately — that's two texts and two round-trips for one piece of info, wastes their time and our tokens. Only ask them as two separate messages if their first answer genuinely only covered one of the two (e.g. they said "iPhone" but didn't mention a carrier). Once you have both, give the CORRECT device+carrier-specific steps for TRUE conditional (no-answer-only) forwarding — NEVER the plain Settings toggle, which forwards ALL calls immediately with zero rings and would break their phone line. iPhone has no true "forward when unanswered" option in Settings — it must be done with a carrier code dialed like a phone call. The moment you know both device=iphone AND carrier is AT&T, T-Mobile, or Verizon, call send_forwarding_code with carrier set to "att_tmobile" or "verizon" — it sends the exact code as its own standalone text message so it's a single tap-and-hold-to-copy block, and tells you what to say next. Do NOT type the dial code yourself in your message — let the tool send it separately. To turn OFF forwarding later if anything seems wrong: AT&T/T-Mobile dial ##61# then call, Verizon dial *73 then call — those two are rare/safety-net only, fine to mention inline since they're not the main action. Android: Phone app > 3-dot menu > Settings > Calling accounts (or Supplementary services) > Call forwarding > "When unanswered" > enter ${twilioNumber} > turn on — this IS a true conditional option built into Android's own Settings, no dial code needed, no send_forwarding_code call needed either. If they're on iPhone and running iOS 17 or newer, mention that the "Live Voicemail" feature can silently block conditional forwarding from working — if forwarding doesn't seem to catch missed calls after setup, tell them to check Settings > Phone > Live Voicemail and turn it off. IMPORTANT — do NOT ask them to test it themselves by calling from a second phone. Once they say they've dialed the code / turned it on, call the run_forwarding_test tool IMMEDIATELY, with NO text of your own first — do not write your own version of the "a test call is coming, don't answer it" warning, the tool's own result already contains the exact, correct wording (timing and the "don't hang it up either" instruction included) for you to relay. Live-caught real bug: writing your own warning here produced a shorter, weaker version (wrong timing, missing the "don't hang it up" half) that read as a complete reply on its own — which may also be why the tool call itself got skipped some turns, since the message already sounded finished. Treat calling the tool as the FIRST and only required action the moment the code is confirmed dialed; your reply text to the contractor should come from what the tool returns, not from your own recollection of what the warning should say. Tractify places a real test call and texts them the result automatically (and marks this step done automatically if it passes). Do not mark the step done yourself and do not ask them to text DONE again unless the test comes back showing a problem.`
        : `If you're leading into this step for the first time (e.g. right after finishing availability), open with this exact why-explanation before asking anything — do not invent your own: "Here's how this works: when a homeowner calls looking for service and you miss it, that call needs to go to us instead of just ringing out, so we can text them back and still get you the booking — otherwise they just call the next guy." Live-caught real bug: transitions into this step have twice invented their own explanation of what call forwarding does and gotten it wrong (once saying "when someone books, their call reaches you instantly," once saying "when someone books but you miss the call, we catch it and text you the details" — both describe a call happening AFTER a booking exists, which never happens; forwarding is about catching a homeowner's call BEFORE any booking exists). Never use "when someone books" as the setup for this step. Then ask: is ${liveContractor.phone} the number their customers actually call, or is their business line different? If they say it's the same, call set_business_phone with is_same=true. If they give a different number, call set_business_phone with that number. Do NOT give any forwarding code or instructions yourself here — once set_business_phone runs, you will immediately get the correct detailed guide (with the real carrier codes) for your very next message, so just confirm the number back to them and continue straight into asking device + carrier TOGETHER in one message, exactly as that guide says.`,
    },
    gbp: {
      label: 'Add booking link to Google Business Profile',
      done: !!completedSteps.gbp,
      guide: `Start with why before the steps — e.g. "Right now people searching 'HVAC near me' can find your Google listing but there's no way to book straight from it — that traffic's just sitting there unused." Then give the steps: go to business.google.com > Edit Profile > scroll to Appointments > paste this link: ${bookingLink} > Save. Text DONE when done.`,
    },
    facebook: {
      label: 'Post in a local Facebook group',
      done: !!completedSteps.facebook,
      guide: `Immediately call send_step_copy with step="facebook" — it sends both the "why this matters + how to do it" explanation AND the ready-to-paste post as two separate texts, fully written already. Do NOT write or say anything about this step yourself first — just call the tool right away, it handles the entire explanation. Text DONE when posted.`,
    },
    reviewers: {
      label: 'Message your Google reviewers',
      done: !!completedSteps.reviewers,
      guide: `Immediately call send_step_copy with step="reviewers" — it sends both the "why this matters + how to do it, 4-5 star only" explanation AND the ready-to-paste message (with a [Name] spot to personalize) as two separate texts, fully written already. Do NOT write or say anything about this step yourself first — just call the tool right away, it handles the entire explanation. Text DONE when sent.`,
    },
    messenger: {
      label: 'Set up Messenger + Instagram auto-reply',
      done: !!completedSteps.messenger,
      guide: `Immediately call send_step_copy with step="messenger" — it sends both the "why this matters + how to do it" explanation AND the ready-to-paste auto-reply text as two separate texts, fully written already. Do NOT write or say anything about this step yourself first — just call the tool right away, it handles the entire explanation. Text DONE when done.`,
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

  const scheduleRows = await db.query(
    'SELECT * FROM availability_slots WHERE contractor_id = $1 ORDER BY day_of_week',
    [contractorId]
  );
  const liveScheduleText = scheduleRows.rows.length
    ? scheduleRows.rows.map(s => `${DAYS[s.day_of_week]}: ${fmtTime(s.start_time)}-${fmtTime(s.end_time)}`).join(', ')
    : 'No schedule set';

  const STEP_GUIDES = buildStepGuides(freshRow, completedSteps, bookingLink, twilioNumber, hasBusinessPhoneAnswer, liveScheduleText);
  const nextStep = Object.entries(STEP_GUIDES).find(([, s]) => !s.done);
  if (!nextStep) return null;

  // Live-caught real bug: this used to return the raw `.guide` string and
  // callers (forwardingTest.js's notifyResult) pasted it directly into a
  // real outbound SMS. `.guide` is written as an INSTRUCTION to the AI —
  // e.g. "Start with why before the steps — e.g. '...'. Then give the
  // steps: ..." — meant to be read and paraphrased by handleContractorSms's
  // own model call, not sent verbatim. Once task #49 added that
  // why-before-ask meta-phrasing to several guides, this raw-injection path
  // (which has no model in the loop at all) started texting contractors the
  // literal instruction text, including the "— e.g." framing, instead of an
  // actual composed message. Fix: make a real, tightly-scoped model call
  // here too, so this path produces the same kind of natural message
  // handleContractorSms would have generated, instead of pasting raw
  // internal instructions into a live text.
  const [, stepData] = nextStep;
  let text = stepData.label; // safe fallback if the composer call fails
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const composed = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You write a single SMS text (under 320 characters, no markdown, no bullet points) telling a contractor what their next onboarding step is, based on internal guide notes. Follow the guide's instructions (tone, why-before-how framing, etc) but NEVER include meta-phrasing like "start with why" or "e.g." verbatim — write the actual finished message a human would receive, as if you were mid-conversation with them.`,
      messages: [{
        role: 'user',
        content: `Next step: "${stepData.label}"\n\nInternal guide notes for this step:\n${stepData.guide}\n\nWrite the actual SMS text to send them now, introducing this step.`,
      }],
    });
    const composedText = composed.content.find(b => b.type === 'text')?.text;
    if (composedText) text = composedText;
  } catch (err) {
    console.error('[SMS-AI] getNextStepPromptForContractor composer call failed, falling back to label only:', err.message);
  }

  return { label: stepData.label, text };
}

// ── Main handler ──────────────────────────────────────────────────────────────
// Live-caught real bug (task #66): two rapid back-to-back "Done" texts from
// the same contractor can each kick off their own handleContractorSmsInner
// call before the first finishes writing its reply back to sms_conversation
// — both reads see the same stale history. Live-caught result: the facebook
// step got marked done and the conversation jumped straight into reviewers,
// off what should have been one "Done" advancing exactly one step, with the
// facebook step's actual send_step_copy call apparently never happening (the
// model wrote its own "ready to grab it?" prose instead, mid-race, instead of
// following that step's "call the tool immediately, write nothing yourself"
// instruction). Fixed with a simple in-memory per-contractor queue — a second
// inbound text for a contractor already mid-turn waits for the first to fully
// finish (including its DB write) before starting, so every turn always reads
// real, current state. Single-process assumption (fine on Railway's one
// instance) — would need a DB-backed lock instead if this ever ran multi-instance.
const _contractorProcessingQueue = new Map();
async function handleContractorSms(contractor, incomingText) {
  const contractorId = contractor.id;
  const prior = _contractorProcessingQueue.get(contractorId) || Promise.resolve();
  const current = prior.catch(() => {}).then(() => handleContractorSmsInner(contractor, incomingText));
  _contractorProcessingQueue.set(contractorId, current);
  try {
    return await current;
  } finally {
    if (_contractorProcessingQueue.get(contractorId) === current) {
      _contractorProcessingQueue.delete(contractorId);
    }
  }
}

async function handleContractorSmsInner(contractor, incomingText) {
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

  const STEP_GUIDES = buildStepGuides(liveContractor, completedSteps, bookingLink, twilioNumber, hasBusinessPhoneAnswer, liveScheduleText);

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
- After marking a step done: one short congratulations sentence, then IMMEDIATELY give the first instruction for the next incomplete step in the SAME message — don't just ask "ready to keep going?" and wait. Keep momentum, walk them straight into it. That instruction must be the FULL, specific first ask described in that step's own guide below — never a shortened, generic, or paraphrased-down version just because it's being combined into the same message as the congratulations. Live-caught real bug: the twilio step's guide requires asking device AND carrier together in one question, but when this rule fired as part of a combined "hours confirmed, next up is call forwarding" message, only "iPhone or Android?" got asked and carrier was dropped — re-read that specific step's guide in full before writing this part of the message, don't compress it from memory. The why-explanation you lead with is NOT yours to invent either — each step's guide already contains a specific why-line written for it (e.g. twilio's is about a missed call going to the next guy, never about "when someone books, their call reaches you"). Live-caught real bug: a combined "hours confirmed, next up is call forwarding" transition invented its own why-line that described call forwarding backwards — it said calls would "reach you instantly" when someone books, when what forwarding actually does is catch a call you MISS and hand it to us so we can text the homeowner and still get you the booking. Getting the why wrong is worse than skipping it — always pull the why-framing from that step's own guide text, never compose a fresh one from memory. IMPORTANT exception: if the next step's own guide says to call a tool immediately (send_step_copy for facebook/reviewers/messenger) and write NOTHING yourself first, follow THAT instead — call the tool right away with no congratulations-plus-prose message of your own. Live-caught real bug: writing your own "ready to grab it?" transition into facebook instead of immediately calling send_step_copy meant the actual ready-to-paste post never got sent, even though the conversation moved on as if it had.
- When guiding a step: give ONE clear instruction, end with "Reply DONE when set." Never assume they know a term or menu path — spell it out exactly, as if they've never done this before.
- Whenever you give them a phone number to use (for forwarding, calling, etc), tell them to tap and hold it to copy it rather than retyping it by hand.
- If they ask what's next, tell them just the next incomplete step.
- If all steps done: tell them all channels are live and jobs are coming.
- Calendar questions: reply with day, time, name — brief and clear.
- If they reply YES $amount or NO to a check-in about a past job — use log_job_outcome immediately.
- If a contractor seems stuck, confused, or asks "what do you mean" / "where do I go" — never just repeat the same instruction. Ask what they're actually seeing on their screen and walk them through it from there, or offer to explain it a different way.
- If they ask a real question — even a quick one, like "can I update this later?" or "does this cost extra?" — answer it directly. Never silently skip past a question and just barrel forward to the next step or mark something done — that reads as ignoring them, even if you also technically completed the action they asked about. Weave the answer into the same message that continues the step (e.g. "Yep, just text me anytime to add more zips later. Your service area's locked in — next up...") rather than making them ask twice or notice you never replied.
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
      name: 'send_forwarding_code',
      description: 'Sends the exact carrier dial code as its own standalone text message, separate from your explanation. Use this the moment you know both device=iphone AND carrier (att_tmobile or verizon) — do NOT type the dial code yourself in your reply, this tool computes it correctly and sends it on its own so it is easy to tap-and-hold to copy. Not needed for Android (no dial code — built-in Settings menu) or if carrier is "other"/unknown.',
      input_schema: {
        type: 'object',
        properties: {
          carrier: {
            type: 'string',
            enum: ['att_tmobile', 'verizon'],
            description: 'att_tmobile for AT&T or T-Mobile (GSM-style code), verizon for Verizon (simpler code).',
          },
        },
        required: ['carrier'],
      },
    },
    {
      name: 'send_step_copy',
      description: 'Sends the exact ready-to-paste copy for a self-serve setup step (Facebook group post, Google reviewer reply, or Messenger/Instagram auto-reply) as its own standalone text message, computed with the contractor\'s real business name and booking link. Use this instead of writing or paraphrasing your own version of the post/message in your reply — live-tested and found that a paraphrased version drifts from the actual intended copy every time. Call this the moment you\'re ready to hand them the text for facebook, reviewers, or messenger — do not type your own version of it first.',
      input_schema: {
        type: 'object',
        properties: {
          step: {
            type: 'string',
            enum: ['facebook', 'reviewers', 'messenger'],
            description: 'Which step this copy is for.',
          },
        },
        required: ['step'],
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
      description: 'Test whether call forwarding is actually set up correctly, by having Tractify place a real test call to the contractor\'s own number about 10 seconds after this tool runs. Use this the moment the contractor says they\'ve dialed the forwarding code / turned on the toggle — do NOT ask them to test it themselves by calling from another phone, Tractify tests it automatically now. IMPORTANT: the toolResult you get back tells you exactly what to say — send that warning to the contractor immediately, before the call lands, so they know not to answer it. Do not mark the twilio step done yourself — the test result (sent as a separate text within about a minute) marks it done automatically if it passes.',
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
    // 300 was too tight — a single turn can require several tool_use blocks
    // back to back (e.g. "closed Saturdays, Mon-Fri 9-5" needs 6 separate
    // update_availability_slot calls, one per day) plus a closing summary
    // sentence. Raised to 1024, then live-caught still occasionally hitting
    // that ceiling on a 5-7-tool-call turn (nondeterministic — same message
    // retried a second time succeeded). Raised again to 2048 for real margin.
    // Also see the while loop below — a max_tokens response used to discard
    // every tool_use block in it, even complete ones, instead of processing
    // whatever the model did manage to finish before truncation.
    max_tokens: 2048,
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
  // Set to true whenever a tool's instructions tell the model to send zero
  // reply text because deterministic SMS messages already said everything
  // (send_forwarding_code, send_step_copy). Live-caught real bug: the code
  // used to have no concept of "intentionally silent" — any turn with no
  // text block, whether from genuine failure OR from being told to stay
  // quiet, fell into the same "Didn't quite catch that" fallback, which
  // then got sent as an actual confusing 4th SMS right after three messages
  // that worked perfectly. This flag lets the two cases be told apart.
  let intentionalSilence = false;
  // Live-caught real bug (task #70): the availability guide requires reading
  // final hours back and waiting for an explicit yes BEFORE calling
  // complete_setup_step — but on a fresh "no schedule set" contractor, the
  // model saved the hours via update_availability_slot AND declared "schedule
  // locked in, next up is call forwarding" in the SAME reply, skipping the
  // required confirm round-trip entirely. Confirmed live: several steps
  // later, the next-step prompt correctly showed availability as still
  // incomplete, meaning complete_setup_step genuinely never got called even
  // though the contractor was told it was done. Track whether hours were
  // saved THIS call and hard-block completing availability in the same call —
  // per the guide, these two tool calls should never legitimately happen
  // in the same turn (the confirm-and-complete step always requires the
  // contractor's NEXT reply, a separate handleContractorSmsInner call).
  let availabilitySavedThisCall = false;
  // Companion to intentionalSilence — a short, tool-specific note describing
  // what was actually sent, used INSTEAD of the generic "(no text reply)"
  // placeholder when persisting this turn to sms_conversation. Live-caught
  // real bug: the generic placeholder gave the model nothing to go on next
  // turn, so on every subsequent "Done" it re-called send_forwarding_code
  // from scratch instead of proceeding to run_forwarding_test — it had no
  // memory that the code had already been sent, since the guide text for an
  // incomplete step re-injects "once you know device+carrier, call
  // send_forwarding_code" every single turn regardless. A specific summary
  // here gives the model real grounding to recognize "I already did this."
  let silentActionSummary = null;

  // Also enter this loop on stop_reason === 'max_tokens' if the truncated
  // response still contains at least one complete tool_use block. Live-caught
  // real bug: the API only returns FULLY-formed content blocks even when
  // generation is cut off mid-response — so a max_tokens turn can still carry
  // several legitimate, already-complete tool_use calls (e.g. update_
  // availability_slot for Mon/Tue/Wed) that just happened to be followed by
  // something that didn't fit. The old `while (stop_reason === 'tool_use')`
  // condition silently discarded all of them the moment truncation hit,
  // meaning real work the model already finished never got saved — worse
  // than just a "didn't catch that" reply, since it looked like nothing
  // happened when some of it actually had. Only fall through to the generic
  // fallback now if there's truly nothing usable to process.
  while (
    response.stop_reason === 'tool_use' ||
    (response.stop_reason === 'max_tokens' && response.content.some(b => b.type === 'tool_use'))
  ) {
    const toolBlocks = response.content.filter(b => b.type === 'tool_use');
    if (!toolBlocks.length) break;

    const toolResultBlocks = [];

    for (const toolBlock of toolBlocks) {
    const { name, id: toolUseId, input } = toolBlock;
    let toolResult = '';

    if (name === 'complete_setup_step') {
      try {
        const { step_key } = input;

        // Verification gate for availability — this step was getting marked
        // done purely on the model's read of the conversation (e.g. "yes
        // correct" after asking to confirm hours), with zero check that
        // update_availability_slot had actually persisted anything. Live-
        // confirmed bug: the AI told a contractor "your schedule is locked
        // in" while availability_slots had zero rows for them — nothing had
        // actually saved. Refuse to mark this step done unless at least one
        // real row exists; a contractor with a real schedule always has at
        // least one active day, so an empty table means nothing was saved.
        if (step_key === 'availability') {
          const { rows: slotRows } = await db.query(
            'SELECT COUNT(*) AS cnt FROM availability_slots WHERE contractor_id = $1',
            [contractorId]
          );
          if (parseInt(slotRows[0].cnt, 10) === 0) {
            toolResult = `Error: cannot mark availability complete — no rows exist in availability_slots for this contractor yet, meaning nothing was actually saved. Do NOT tell them it's locked in. Call update_availability_slot for each day they gave you (this may not have actually run last turn), then only call complete_setup_step again after that succeeds.`;
            toolResultBlocks.push({ type: 'tool_result', tool_use_id: toolUseId, content: toolResult });
            continue;
          }

          // Live-caught real bug (task #70): calling update_availability_slot
          // and complete_setup_step in the SAME reply skips the guide's
          // required "read the final hours back and get an explicit yes"
          // round-trip — the contractor never actually confirmed anything,
          // yet got told "schedule locked in." Per the guide, these two tools
          // should never both fire in one turn: save+read-back is turn N,
          // complete only happens after their NEXT reply confirms it.
          if (availabilitySavedThisCall) {
            toolResult = `Error: cannot mark availability complete in the same reply where you just saved hours via update_availability_slot — you have not actually read the final hours back and gotten an explicit yes from them yet. Instead, state the hours you just saved and ask "does that look right?" — end your turn there with no completion. Only call complete_setup_step on their NEXT reply, once they've actually confirmed.`;
            toolResultBlocks.push({ type: 'tool_result', tool_use_id: toolUseId, content: toolResult });
            continue;
          }
        }

        // Same verification-gate principle as availability above, added for
        // task #67: a rapid double-"Done" race let facebook get marked done
        // (and the conversation move straight into reviewers) without
        // send_step_copy ever actually having sent the real ready-to-paste
        // post. Refuse completion for these three steps unless send_step_copy
        // genuinely fired for that step first.
        if (['facebook', 'reviewers', 'messenger'].includes(step_key)) {
          const freshCheck = await db.prepare('SELECT onboarding_steps FROM contractors WHERE id = $1').get(contractorId);
          const freshFlags = typeof freshCheck?.onboarding_steps === 'string'
            ? JSON.parse(freshCheck.onboarding_steps || '{}')
            : (freshCheck?.onboarding_steps || {});
          if (!freshFlags[`${step_key}_copy_sent`]) {
            toolResult = `Error: cannot mark "${step_key}" complete — send_step_copy was never actually called for this step yet, meaning the contractor never received the real ready-to-paste text. Call send_step_copy with step="${step_key}" now instead, with no text of your own, then wait for them to confirm before calling complete_setup_step again.`;
            toolResultBlocks.push({ type: 'tool_result', tool_use_id: toolUseId, content: toolResult });
            continue;
          }
        }

        const { rows: updatedRows } = await db.query(`
          UPDATE contractors
          SET onboarding_steps = COALESCE(onboarding_steps, '{}'::jsonb) || $1::jsonb,
              onboarding_started_at = COALESCE(onboarding_started_at, NOW())
          WHERE id = $2
          RETURNING onboarding_steps
        `, [JSON.stringify({ [step_key]: true }), contractorId]);
        toolResult = `Step "${step_key}" marked complete.`;
        console.log(`[SMS-AI] Marked step "${step_key}" complete for contractor ${contractorId}`);

        // Live-caught real bug (task #68): the rule-411 exception telling the
        // model "if the next step's guide says call the tool immediately with
        // no text of your own, do that instead of writing a transition
        // message" was NOT reliably followed even after being added — Jose
        // confirmed this recurred (messenger step: "Ready to grab that text?"
        // instead of immediately calling send_step_copy) on a fresh test
        // after that fix was live. A natural-language exception buried in a
        // long system-prompt rules list is too easy to miss. Same lesson as
        // every other "the model won't reliably compose exact wording itself"
        // bug fixed tonight (forwarding-code, forwarding-test warning) —
        // inject the actual next action directly into THIS tool's own result,
        // which the model is reacting to right in this turn, instead of
        // trusting it to recall a general rule from earlier in the prompt.
        const freshStepsForNext = updatedRows[0]?.onboarding_steps || {};
        const nextStepKey = ALL_STEP_KEYS.find(k => !freshStepsForNext[k]);
        if (nextStepKey && ['facebook', 'reviewers', 'messenger'].includes(nextStepKey)) {
          toolResult += ` Next incomplete step is "${nextStepKey}". Call send_step_copy with step="${nextStepKey}" RIGHT NOW, in this same reply, as your only action — write NO text of your own first, not even a short line like "ready to grab it?" or "last one:" — the tool sends both the why/how intro and the ready-to-paste copy directly as SMS messages on its own.`;
        }

        // Power message fires once the FULL checklist (all 7 steps, not just
        // the 3 required ones) is genuinely complete — see ALL_STEP_KEYS
        // comment above for the two rounds of live-testing that got this
        // here. Checked freshly off the just-updated onboarding_steps
        // regardless of which order the contractor finished steps in, so it
        // fires exactly once, right at the true end of setup.
        const freshSteps = updatedRows[0]?.onboarding_steps || {};
        const allStepsDone = ALL_STEP_KEYS.every(k => freshSteps[k]);
        if (allStepsDone && !contractor.sms_power_message_sent && twilioClient) {
          await db.query('UPDATE contractors SET sms_power_message_sent = 1 WHERE id = $1', [contractorId]);
          setTimeout(() => sendPowerMessage(contractor, twilioClient).catch(err =>
            console.error('[SMS-AI] Power message failed:', err.message)
          ), 3000);
        }

        // Fire specialty messages after key steps. Staggered 3s/9s/15s (rather
        // than 3s/3s/9s as before) because twilio is typically the last of
        // the 3 required steps a contractor finishes — meaning the power
        // message above and this calendar-training message often now fire
        // off the SAME event. Re-staggering avoids two texts landing at once.
        if (step_key === 'twilio' && !contractor.sms_calendar_training_sent && twilioClient) {
          await db.query('UPDATE contractors SET sms_calendar_training_sent = 1 WHERE id = $1', [contractorId]);
          setTimeout(() => sendCalendarTrainingMessage(contractor, twilioClient).catch(err =>
            console.error('[SMS-AI] Calendar training message failed:', err.message)
          ), 9000);
          // Capabilities guide fires 15s after main reply so all texts triggered by this one event arrive in sequence
          const capCheck = await db.query('SELECT sms_capabilities_sent FROM contractors WHERE id = $1', [contractorId]);
          if (!capCheck.rows[0]?.sms_capabilities_sent) {
            await db.query('UPDATE contractors SET sms_capabilities_sent = 1 WHERE id = $1', [contractorId]);
            setTimeout(() => sendCapabilitiesGuide(contractor, twilioClient).catch(err =>
              console.error('[SMS-AI] Capabilities guide failed:', err.message)
            ), 15000);
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

    } else if (name === 'send_forwarding_code') {
      // Computed here, deterministically, instead of trusting the model to type
      // the exact code correctly in its own reply — that's exactly the class of
      // mistake task #19 caught live (wrong code, wrong destination number). Sent
      // as its own separate SMS (task #21) so it's a single tappable block the
      // contractor can copy-hold, instead of buried mid-sentence.
      try {
        const { carrier } = input;
        const forwardNumber = contractor.business_phone || contractor.phone;
        if (!twilioClient) {
          toolResult = `Error: Twilio not configured — tell them the code will follow shortly.`;
        } else if (!forwardNumber) {
          toolResult = `Error: no number on file to build the code from — resolve set_business_phone first.`;
        } else if (!contractor.twilio_number) {
          toolResult = `Error: no Tractify number assigned yet to forward TO — this shouldn't happen at this step, flag it.`;
        } else {
          const code = carrier === 'verizon'
            ? `*71${contractor.twilio_number}`
            : `**61*${contractor.twilio_number}*11*20#`;

          // ── Root-cause fix for the ordering bug (Jose live-caught it, Aug 21) ──
          // The explanation used to be Claude's own generated reply, sent whenever
          // Claude's turn finished — that requires an extra model round-trip after
          // this tool_result comes back, which can easily take longer than a fixed
          // setTimeout. The bare code, on its own independent 1.5s timer, would
          // sometimes win the race and arrive FIRST, with the explanation landing
          // after it — backwards, and confusing even to Jose himself when he tested
          // it live. Fix: send the explanation directly from here, immediately, so
          // it's not competing with an unrelated clock — then send the bare code on
          // a real, guaranteed gap AFTER that actual send, not a guess against
          // Claude's latency. toolResult tells Claude not to also write its own
          // version, so the contractor never gets a redundant third text either.
          const explanation = `Here's exactly what to do. In a few seconds I'll text you a code by itself — once it lands, press and hold on it and tap Copy. Then open your Phone app like you're about to call someone. Tap the Keypad tab (the number pad icon) at the bottom. Tap and hold in the number field at the top until "Paste" pops up, then tap Paste — the code fills in. Tap the green call button. It'll connect for a second then hang up on its own — that's normal, that means it worked. Text me DONE once you've dialed it.`;

          twilioClient.messages.create({
            to: forwardNumber, from: contractor.twilio_number, body: explanation,
          }).catch(err => console.error('[SMS-AI] send_forwarding_code explanation send failed:', err.message));

          setTimeout(() => {
            twilioClient.messages.create({
              to: forwardNumber, from: contractor.twilio_number, body: code,
            }).catch(err => console.error('[SMS-AI] send_forwarding_code code send failed:', err.message));
          }, 4000);

          // Optional visual reference — sent LAST, after both time-critical
          // messages, on purpose. Jose's own framing: "in case they need it
          // for reference," i.e. a fallback for once they already have the
          // instructions + code in hand, not required pre-reading. Putting it
          // between the explanation and the code would reintroduce the exact
          // 3-messages-in-the-critical-path clutter just fixed above.
          setTimeout(() => {
            twilioClient.messages.create({
              to: forwardNumber, from: contractor.twilio_number, body: 'Want to see it step by step? tractifyhq.com/how-to',
            }).catch(err => console.error('[SMS-AI] send_forwarding_code how-to link send failed:', err.message));
          }, 7000);

          intentionalSilence = true;
          silentActionSummary = `(Already sent the forwarding-code explanation, the bare dial code, and the how-to link as direct SMS — do NOT call send_forwarding_code again for this contractor. Once they say they've dialed it / it's done, call run_forwarding_test instead.)`;
          toolResult = `Three messages are already being sent directly — the numbered explanation now, the bare code 4 seconds after, and an optional "want to see it step by step?" link 7 seconds after that as a fallback reference. Together they already say everything needed, including asking them to text DONE once it's dialed. Send NO reply text of your own about THIS step — not even a short acknowledgment. Live-tested: even one extra line here creates a confusing message that just re-narrates what the first message already said, landing in the middle of the sequence. EXCEPTION: if their message also contained something completely unrelated (a real question, or a request like changing their hours/zip codes elsewhere), you may still call whatever tool that needs (e.g. update_availability_slot) and add ONE brief line acknowledging just that separate thing — just nothing about the forwarding code itself.`;
          console.log(`[SMS-AI] Sent forwarding explanation + code + how-to link (${carrier}) to ${contractorId}`);
        }
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] send_forwarding_code error:', err.message);
      }

    } else if (name === 'send_step_copy') {
      // Same principle as send_forwarding_code (tasks #19/#21/#43): stop
      // trusting the model to relay exact copy-paste text verbatim — live-
      // caught tonight paraphrasing the Facebook post guide's ready copy into
      // its own version instead of sending it as written. Compute and send
      // the real text deterministically, every time, as its own message.
      try {
        const { step } = input;
        const bookingLink = contractor.booking_slug
          ? `https://tractifyhq.com/schedule/${contractor.booking_slug}`
          : 'https://tractifyhq.com/schedule';
        const bizName = contractor.company_name || contractor.name;

        const COPY_TEMPLATES = {
          facebook: `Hi everyone! I run ${bizName} and just launched online booking. No phone tag — just pick a time: ${bookingLink}`,
          // Reworked to sound warm/authentic, not templated (Jose reviewed
          // both drafts and picked this one specifically for "one thing since
          // then" — a softer, more attention-grabbing hook than a flat
          // announcement, more likely to actually get read and clicked).
          reviewers: `Hi [Name]! Really appreciate you taking the time to leave that review — made our day. One thing since then: we now do online booking, so if you ever need us again it's as easy as grabbing a time here: ${bookingLink}. Thanks again for trusting us with the work!`,
          messenger: `Thanks for reaching out to ${bizName}! Book a time here: ${bookingLink} — takes 60 seconds.`,
        };
        const copyText = COPY_TEMPLATES[step];

        // Deterministic "why + how" intros, sent directly ahead of each copy
        // (Jose reviewed and approved this exact wording for all three) —
        // same reasoning as everything else built tonight: don't let the
        // model write or race its own version of text that's already been
        // nailed down word for word.
        const INTRO_TEMPLATES = {
          facebook: `Local Facebook groups are full of homeowners asking their neighbors for contractor recommendations — free leads, no ad spend. Search Facebook for your city + "neighbors" or "community" groups, join one, then post in it — and I'll send you the exact copy to paste right after this. Text DONE once it's posted.`,
          reviewers: `Your happy customers already paid you and loved the work — they're your warmest leads for repeat business or a referral. Go to business.google.com, click Reviews, and reply only to your 4 and 5-star reviews — skip anything lower than that, this isn't the moment to pitch someone who wasn't happy. I'll send the exact message to paste next — just swap in their name where it says [Name]. Text DONE once you've replied to all your 4 and 5-star ones.`,
          // Live-caught real gap (not a code bug — a wrong instruction):
          // Instant Reply's own "Channels" section has SEPARATE checkboxes
          // for Messenger and Instagram — toggling the feature on does NOT
          // automatically cover both. The old copy implied one toggle
          // covered both, which left a contractor unsure if Instagram was
          // actually covered, and the AI had no accurate grounding to
          // answer that follow-up question confidently. Now explicit.
          messenger: `Homeowners DM your Facebook or Instagram all the time and never hear back — whoever responds first usually gets the job. Go to business.facebook.com, click Inbox, then Automation, then Instant Reply, toggle it on, then under "Channels" make sure BOTH the Messenger box and the Instagram box are checked — they're separate checkboxes, checking one doesn't check the other. I'll send the exact auto-reply text to paste next. Text DONE once both are checked and it's saved.`,
        };
        const introText = INTRO_TEMPLATES[step];

        if (!twilioClient) {
          toolResult = `Error: Twilio not configured — tell them the text will follow shortly.`;
        } else if (!copyText) {
          toolResult = `Error: unknown step "${step}" — valid values are facebook, reviewers, messenger.`;
        } else if (introText) {
          twilioClient.messages.create({
            to: contractor.phone, from: contractor.twilio_number, body: introText,
          }).catch(err => console.error('[SMS-AI] send_step_copy intro send failed:', err.message));
          setTimeout(() => {
            twilioClient.messages.create({
              to: contractor.phone, from: contractor.twilio_number, body: copyText,
            }).catch(err => console.error('[SMS-AI] send_step_copy copy send failed:', err.message));
          }, 4000);
          intentionalSilence = true;
          silentActionSummary = `(Already sent the "${step}" intro and ready-to-paste copy as direct SMS — do NOT call send_step_copy for "${step}" again. Wait for them to confirm it's posted/saved before moving on.)`;
          toolResult = `Both messages are already being sent directly — the "why + how" intro now, the ready-to-paste copy 4 seconds after. Do NOT write your own version of either one and do NOT repeat the copy in your reply — nothing about THIS step. Live-caught real bug: a contractor said "Done" for this step AND asked to change their hours in the same message — the change saved correctly on the backend via update_availability_slot, but the reply said nothing about it at all, reading as if it had been ignored. EXCEPTION: if their message also contained something completely unrelated (a real question, or a request like changing hours/zip codes), still call whatever tool that needs and add ONE brief line acknowledging just that — e.g. "Got it, Wednesday's now closed." — just nothing about this step's copy/intro.`;
          // Live-caught real bug (task #67): complete_setup_step for facebook/
          // reviewers/messenger was purely conversational — nothing checked
          // that send_step_copy had actually fired before allowing the step to
          // be marked done. A rapid double-"Done" race let the model mark
          // facebook complete and move on to reviewers without ever having
          // sent the actual copy-paste post, same class of gap task #39
          // already fixed for availability. Persist a flag the moment the
          // copy is genuinely queued so complete_setup_step can refuse to mark
          // this step done without it, regardless of what the conversation
          // history says.
          await db.query(
            `UPDATE contractors SET onboarding_steps = COALESCE(onboarding_steps, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
            [JSON.stringify({ [`${step}_copy_sent`]: true }), contractorId]
          );
          console.log(`[SMS-AI] Sent ${step} intro + copy-paste text to ${contractorId}`);
        } else {
          twilioClient.messages.create({
            to: contractor.phone, from: contractor.twilio_number, body: copyText,
          }).catch(err => console.error('[SMS-AI] send_step_copy send failed:', err.message));
          toolResult = `The exact copy-paste text is being sent as its own text message right now. Tell them it's coming and to copy that one directly — do NOT retype, rewrite, or paraphrase it yourself in your reply.`;
          console.log(`[SMS-AI] Sent ${step} copy-paste text to ${contractorId}`);
        }
      } catch (err) {
        toolResult = `Error: ${err.message}`;
        console.error('[SMS-AI] send_step_copy error:', err.message);
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
          // Live bug (Jose's own test): the reply the AI sends after calling this
          // tool is composed from THIS toolResult text, not from the step guide's
          // earlier "give me 10 seconds, don't answer" instruction — that guide
          // text is easy to lose once a tool_result is in front of the model. Put
          // the actual warning directly in the toolResult so it can't get dropped.
          // Second live bug, same test: the warning just said "don't answer it,"
          // which wasn't specific enough — Jose answered/hung up the actual test
          // call on reflex when it rang, and an answered-then-hung-up call reads
          // identically to "forwarding never caught this at all" on the resolver
          // side (see resolveFromOutboundStatus in forwardingTest.js), producing
          // a false not_forwarding result even though forwarding was set up
          // correctly. Now explicit: let it ring through to voicemail, don't
          // answer AND don't hang it up either. Delay before the call actually
          // fires was also widened from 10s to 18s (see forwardingTest.js) since
          // the warning text and the phone ringing were landing almost on top of
          // each other, leaving no real time to read it first.
          toolResult = `Test call placed — it will actually ring their real phone in about 18-20 seconds. Tell the contractor EXACTLY this, right now, before anything else: a real call from Tractify is about to come through in about 15-20 seconds — when it rings, do NOT answer it, and do NOT hang it up either — just let it ring through to voicemail on its own, that's the whole test and it's not a real call. They'll get a text with the result within about a minute after that. No further action needed from them right now.`;
        } else if (result.reason === 'missing_number') {
          toolResult = `Error: no phone number on file to test — resolve set_business_phone first.`;
        } else if (result.reason === 'already_in_progress') {
          // Live-caught real bug (task #69): a repeat "Done" while a test is
          // still pending must NOT trigger a second real test call, and must
          // NOT send the contractor a duplicate "a call is coming" text either
          // — they already got that message once for the test already running.
          intentionalSilence = true;
          silentActionSummary = `(A forwarding test is already in progress from a moment ago — did NOT start a second one and did NOT send another "a call is coming" text, since they already got that message. Just wait for the result text.)`;
          toolResult = `A test is already in progress from their last "Done" — do NOT start another one and do NOT send them anything about the test, they already got the warning text once. EXCEPTION: if their message also contained something unrelated (a real question, or a request like changing hours/zip codes), still handle that and reply with one brief line about it — just nothing about the test itself.`;
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
          // id has no DB default and is NOT NULL — omitting it here was the
          // actual root cause of every SMS-driven availability change silently
          // failing (confirmed live via Railway logs: "null value in column
          // 'id' ... violates not-null constraint" on every single call).
          // contractorSignup.js's seedAvailability() already generates one
          // via uuidv4() for the initial intake-time seed — this INSERT just
          // never matched that pattern.
          await db.query(
            `INSERT INTO availability_slots (id, contractor_id, day_of_week, start_time, end_time, is_active)
             VALUES ($1, $2, $3, $4, $5, 1)`,
            [uuidv4(), contractorId, day_of_week, start_time, end_time]
          );
          toolResult = `Updated ${dayName} to ${fmtTime(start_time)}-${fmtTime(end_time)}.`;
        } else {
          toolResult = `Marked ${dayName} as unavailable.`;
        }
        availabilitySavedThisCall = true;
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
      max_tokens: 2048, // see comment on the first messages.create() call above
      system: await buildSystemPrompt(),
      tools,
      messages: toolMessages,
    });
  }

  // This fallback firing at all now means something genuinely unexpected
  // happened (not just "still working, ask again") — so it shouldn't imply
  // an automatic follow-up that doesn't exist. Nothing in this codebase
  // retries a stalled turn on its own; the contractor texting again is the
  // only thing that actually triggers another attempt.
  //
  // IMPORTANT: a missing text block does NOT always mean failure. Tools like
  // send_forwarding_code and send_step_copy deliberately instruct the model
  // to end its turn with zero text, since the deterministic SMS messages
  // they already sent say everything needed. That case sets
  // intentionalSilence = true above. Live-caught real bug: before this fix,
  // both cases (genuine failure vs. intentional silence) fell into the same
  // fallback string, which then got sent as an actual confusing extra SMS
  // right after a working message sequence. Now: intentional silence stores
  // a short placeholder in conversation history (so the AI has something
  // sane to look back on next turn) but returns null to the caller, which
  // twilio.js's webhook handler treats as "don't send anything."
  const textBlock = response.content.find(b => b.type === 'text')?.text;
  const reply = textBlock
    || (intentionalSilence ? null : "Didn't quite catch that — mind sending it again?");

  // ── Persist conversation (keep last 20 messages = 10 exchanges) ─────────────
  const updatedHistory = [
    ...history,
    { role: 'user', content: incomingText },
    { role: 'assistant', content: reply ?? silentActionSummary ?? '(no text reply — deterministic messages already sent)' },
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

  // Live-caught real bug: this welcome text is sent completely outside the
  // AI conversation loop (handleContractorSms is the only place that ever
  // writes to sms_conversation). That meant a contractor's first-ever reply
  // — "Yes", replying directly to "Reply YES to start" right above — landed
  // with ZERO conversation history. The AI genuinely had no record of ever
  // asking that question, so it (correctly, given the context it actually
  // had) asked the contractor to clarify what they meant instead of just
  // starting setup — a clean "yes" answer to an unambiguous question ended
  // up looking like the AI second-guessing something obvious.
  //
  // Fix: seed sms_conversation with a synthetic user/assistant pair
  // representing this exact welcome text, so the AI's very next turn has
  // real grounding. Safe to do unconditionally here specifically because
  // sendWelcomeText only ever fires once, as the first message in a brand
  // new conversation — sms_conversation is guaranteed empty at this point,
  // so this can't violate the Anthropic API's "must start with a user
  // message" / strict alternation rules the way blindly appending to an
  // existing history could. The other deterministic sends (power message,
  // step drip texts, forwarding-test results) have the same blind spot in
  // principle but aren't guaranteed to be conversation[0] — fixing those
  // safely needs a shared alternation-safe append helper, not done here.
  await db.query(
    `UPDATE contractors SET sms_welcome_sent = 1, last_setup_sms_at = NOW(),
     sms_conversation = $2::jsonb WHERE id = $1`,
    [contractor.id, JSON.stringify([
      { role: 'user', content: '(system: Twilio number just assigned, no reply yet)' },
      { role: 'assistant', content: body },
    ])]
  );

  console.log(`[SMS-AI] Welcome text sent to ${contractor.name} (${contractor.id})`);
}

// ── Power message ── fires after step 1 (availability) confirmed ──────────────
// Makes the calendar management capability feel like unlocking a superpower.
// Drives the first test reply — product becomes real the moment they get an answer.
async function sendPowerMessage(contractor, twilioClient) {
  const body = `Quick heads up — this number does more than setup. Text me "what's on my calendar tomorrow" right now and I'll read it back in 10 seconds. Text "block Wednesday 2-5pm" and it's blocked. Try it.`;

  await twilioClient.messages.create({
    to: contractor.phone,
    from: contractor.twilio_number,
    body,
  });
  await appendDeterministicSmsTurn(contractor.id, body, '(system: full checklist complete, power message sent)');

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
  await appendDeterministicSmsTurn(contractor.id, body, '(system: twilio step confirmed, calendar training sent)');

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
  await appendDeterministicSmsTurn(contractor.id, body, '(system: capabilities guide sent)');

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
      ? `Step 3 of 3. Here's how this works: when you miss a call, it'll forward to us instead of just ringing out, and we'll text the caller right away so you don't lose the job. Every call you miss right now is a homeowner who might just call your competitor instead. Are you on an iPhone or Android, and is your carrier AT&T, T-Mobile, Verizon, or something else?`
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
  await appendDeterministicSmsTurn(contractor.id, textBody, `(system: proactive drip text sent for step "${nextIncomplete}")`);

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
  appendDeterministicSmsTurn,
};
