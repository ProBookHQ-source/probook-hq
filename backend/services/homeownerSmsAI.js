/**
 * homeownerSmsAI.js — Brain 3: Homeowner conversational SMS booking
 *
 * When a homeowner texts a contractor's Twilio number (via missed call, van wrap,
 * Facebook Lead Ad, or any other channel), this brain takes over and books them
 * in a 4-message conversation — entirely over SMS, no browser required.
 *
 * State machine:
 *   awaiting_address  → awaiting_service → awaiting_slot → awaiting_email → confirmed
 *   (returning homeowners skip awaiting_address — pre-populated from last booking)
 *
 * The contractor finds out when a push notification hits their phone.
 * The homeowner gets a confirmation text. Nobody did anything manually.
 */

const { v4: uuidv4 } = require('uuid');
const https  = require('https');
const db     = require('../database/db');
const { getRelevantKnowledge } = require('./diagnosticKnowledge');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_CHARS = 320;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDate(dateStr) {
  // dateStr = 'YYYY-MM-DD'
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── ZIP extraction + service area check ──────────────────────────────────────
function extractZip(address) {
  const matches = (address || '').match(/\b(\d{5})(?:-\d{4})?\b/g);
  if (!matches) return null;
  return matches[matches.length - 1].slice(0, 5); // last match = ZIP (city, state, ZIP order)
}

function isInServiceArea(address, serviceZipCodesJson) {
  try {
    const zips = typeof serviceZipCodesJson === 'string'
      ? JSON.parse(serviceZipCodesJson)
      : serviceZipCodesJson;
    if (!zips || !Array.isArray(zips) || zips.includes('*')) return true; // wildcard = all
    const zip = extractZip(address);
    if (!zip) return true; // can't parse ZIP — give benefit of the doubt
    return zips.includes(zip);
  } catch (e) {
    return true; // parse error = permissive
  }
}

// ── Returning homeowner check ─────────────────────────────────────────────────
async function getLastConfirmedBooking(phone, contractorId) {
  return db.prepare(`
    SELECT name, address, service_description
    FROM homeowner_sms_sessions
    WHERE phone = $1 AND contractor_id = $2
      AND state = 'confirmed'
      AND name IS NOT NULL AND address IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(phone, contractorId);
}

// ── Graceful exit detection ───────────────────────────────────────────────────
const EXIT_RE = /^(no\s*thanks?|not\s*interested|never\s*mind|nevermind|forget\s*it|nvm|nm|no\s*need|don'?t\s*need|not\s*now|maybe\s*later|i'?m\s*good|all\s*good|no\s*worries)$/i;

async function callClaude(messages, tools, system) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? { type: 'auto' } : undefined,
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Claude parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Fetch open slots for next 7 days ─────────────────────────────────────────
async function getOpenSlots(contractorId) {
  const from = new Date();
  from.setDate(from.getDate() + 1); // start tomorrow
  const to   = new Date();
  to.setDate(to.getDate() + 8);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr   = to.toISOString().slice(0, 10);

  // Get weekly schedule
  const slots = await db.prepare(`
    SELECT * FROM availability_slots
    WHERE contractor_id = $1 AND is_active = 1
    ORDER BY day_of_week, start_time
  `).all(contractorId);

  // Get overrides
  const { rows: overrides } = await db.query(`
    SELECT * FROM availability_overrides
    WHERE contractor_id = $1 AND date >= $2 AND date <= $3
  `, [contractorId, fromStr, toStr]);

  // Get booked appointments
  const { rows: booked } = await db.query(`
    SELECT scheduled_date, scheduled_time FROM appointments
    WHERE contractor_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3
    AND status NOT IN ('cancelled')
  `, [contractorId, fromStr, toStr]);

  const bookedSet = new Set(booked.map(b => `${b.scheduled_date}_${b.scheduled_time}`));
  const overrideMap = {};
  for (const o of overrides) overrideMap[o.date] = o;

  const openSlots = [];
  const cur = new Date(from);
  while (cur <= to && openSlots.length < 9) {
    const dateStr = cur.toISOString().slice(0, 10);
    const dow = cur.getDay();
    const override = overrideMap[dateStr];

    let daySlots = [];
    if (override) {
      if (!override.is_available) { cur.setDate(cur.getDate() + 1); continue; }
      if (override.start_time && override.end_time) {
        daySlots = [{ start_time: override.start_time, end_time: override.end_time }];
      }
    }
    if (!daySlots.length) {
      daySlots = slots.filter(s => s.day_of_week === dow);
    }

    for (const slot of daySlots) {
      // Generate hourly slots within the window
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      let hour = sh;
      while (hour < eh && openSlots.length < 9) {
        const timeStr = `${String(hour).padStart(2, '0')}:${String(sm || 0).padStart(2, '0')}:00`;
        const key = `${dateStr}_${timeStr}`;
        if (!bookedSet.has(key)) {
          openSlots.push({ date: dateStr, time: timeStr, label: `${fmtDate(dateStr)} at ${fmtTime(timeStr)}` });
        }
        hour++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  return openSlots;
}

// ── Get or create a homeowner session ────────────────────────────────────────
async function getSession(phone, contractorId) {
  // Sessions expire after 24 hours of inactivity
  const session = await db.prepare(`
    SELECT * FROM homeowner_sms_sessions
    WHERE phone = $1 AND contractor_id = $2
    AND updated_at > NOW() - INTERVAL '24 hours'
    AND state != 'confirmed'
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(phone, contractorId);
  return session || null;
}

async function createSession(phone, contractorId, name = null, leadId = null) {
  const id = uuidv4();
  await db.prepare(`
    INSERT INTO homeowner_sms_sessions (id, phone, contractor_id, state, name, offered_slots, lead_id)
    VALUES ($1, $2, $3, 'awaiting_address', $4, '[]', $5)
  `).run(id, phone, contractorId, name, leadId);
  return db.prepare(`SELECT * FROM homeowner_sms_sessions WHERE id = $1`).get(id);
}

async function updateSession(sessionId, updates) {
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  await db.query(
    `UPDATE homeowner_sms_sessions SET ${setClauses}, updated_at = NOW() WHERE id = $1`,
    [sessionId, ...values]
  );
}

// ── Core handler — called from twilio.js for homeowner inbound SMS ────────────
async function handleHomeownerSms(phone, contractorId, incomingText, session) {
  const contractor = await db.prepare(
    `SELECT c.id, c.name, c.company_name, c.niche_id, c.phone, c.twilio_number,
            c.service_zip_codes,
            n.name AS niche_name
     FROM contractors c
     LEFT JOIN niches n ON n.id = c.niche_id
     WHERE c.id = $1`
  ).get(contractorId);

  if (!contractor) return null;

  const businessName = contractor.company_name || contractor.name || 'us';

  // ── Graceful exit — detect disinterest in any state ──────────────────────
  if (EXIT_RE.test(incomingText.trim())) {
    await updateSession(session.id, { state: 'confirmed' });
    return `No problem at all! Feel free to text us anytime if you need service. Have a great day!`;
  }

  // ── State routing ──────────────────────────────────────────────────────────
  if (session.state === 'awaiting_address') {
    return handleAddress(session, contractor, businessName, incomingText);
  }
  if (session.state === 'awaiting_service') {
    return handleService(session, contractor, businessName, incomingText);
  }
  if (session.state === 'awaiting_slot') {
    return handleSlotPick(session, contractor, businessName, incomingText);
  }
  if (session.state === 'awaiting_email') {
    return handleEmail(session, contractor, businessName, incomingText);
  }

  // Fallback — session in unknown state, restart
  await updateSession(session.id, { state: 'awaiting_address' });
  return `What address needs service?`;
}

// ── Step 1: Capture address (and name if not yet known) ──────────────────────
async function handleAddress(session, contractor, businessName, text) {
  const needsName = !session.name;

  // Use Claude Haiku to extract name + address (or just address if name already known)
  const systemWithName = `You are an assistant extracting booking info from a homeowner text message.
The homeowner was asked: "What's your name and the address that needs service?"
Extract their name and address and return ONLY valid JSON: {"name": "...", "address": "..."}
If name is unclear, use "Homeowner". If no address is present, use "".
Return ONLY the JSON object. No explanation.`;

  const systemAddressOnly = `You are an address extractor. The user is responding to a question about what address needs HVAC service.
Extract the address from their message. If they gave a clear address (even partial like "123 Main St"), return it as-is.
If the message has no address information at all, return the single word: NONE
Return ONLY the address or NONE. No explanation.`;

  let address = text.trim();
  let name = session.name || null;

  if (ANTHROPIC_API_KEY) {
    try {
      if (needsName) {
        const result = await callClaude(
          [{ role: 'user', content: text }],
          [],
          systemWithName
        );
        const raw = result.content?.[0]?.text?.trim();
        const parsed = JSON.parse(raw);
        if (parsed.name && parsed.name !== 'Homeowner') name = parsed.name;
        if (parsed.address) address = parsed.address;
        // If they only gave a name and no address, ask for address
        if (!parsed.address) {
          await updateSession(session.id, { name: name || session.name });
          return `Thanks ${name || ''}! And the address that needs service?`.trim();
        }
      } else {
        const result = await callClaude(
          [{ role: 'user', content: text }],
          [],
          systemAddressOnly
        );
        const extracted = result.content?.[0]?.text?.trim();
        if (extracted && extracted !== 'NONE') address = extracted;
        else if (extracted === 'NONE') {
          return `What's the address that needs service?`;
        }
      }
    } catch (e) {
      console.error('[BRAIN3] Address extraction error:', e.message);
    }
  }

  // ── Service area check ────────────────────────────────────────────────────
  if (!isInServiceArea(address, contractor.service_zip_codes)) {
    await updateSession(session.id, { state: 'confirmed' }); // close session
    const zip = extractZip(address);
    const areaHint = zip ? `(we cover different zip codes)` : `(we don't serve that area)`;
    return `Thanks! Unfortunately we don't cover that area ${areaHint}. Hope you find help nearby soon!`;
  }

  const updates = { address, state: 'awaiting_service' };
  if (name) updates.name = name;
  await updateSession(session.id, updates);

  // Patch the lead record if session has a lead_id
  if (session.lead_id) {
    await db.query(
      `UPDATE leads SET name = COALESCE($1, name), address = COALESCE($2, address) WHERE id = $3`,
      [name || null, address || null, session.lead_id]
    ).catch(e => console.error('[BRAIN3] Lead patch error:', e.message));
  }

  return `Got it. What's going on — AC, heating, or something else?`;
}

// ── Step 2: Capture service type + give real diagnostic ───────────────────────
async function handleService(session, contractor, businessName, text) {
  const serviceText = text.trim();
  await updateSession(session.id, { service_description: serviceText, state: 'awaiting_slot' });

  // Fetch slots in parallel with diagnostic retrieval
  const [slots, knowledgeChunks] = await Promise.all([
    getOpenSlots(contractor.id),
    getRelevantKnowledge(serviceText, contractor.niche_name || 'HVAC').catch(() => ''),
  ]);

  // Build the slot options string
  if (!slots.length) {
    await updateSession(session.id, { state: 'confirmed' });
    return `We're fully booked this week but I'll have someone call you to schedule. Hang tight!`;
  }

  const offered = slots.slice(0, 3);
  await updateSession(session.id, {
    offered_slots: JSON.stringify(offered),
    state: 'awaiting_slot',
  });

  const slotOptions = offered.map((s, i) => `${i + 1}) ${s.label}`).join('  ');

  // If we have diagnostic knowledge and Claude is available, generate a real diagnostic
  if (knowledgeChunks && ANTHROPIC_API_KEY) {
    try {
      const diagnosticSystem = `You are the scheduling assistant for ${businessName}. A homeowner just described their problem.
Your job: give a brief, honest, expert diagnostic response (1-2 sentences max) then naturally transition to offering appointment times.

KNOWLEDGE BASE — use this to give a real answer:
${knowledgeChunks}

SAFETY RULES (hardcoded — check these first):
- Gas smell / rotten egg: Tell them to leave the home immediately and call gas company or 911. DO NOT book an appointment.
- CO detector going off: Tell them to evacuate and call 911 first.
- Smoke or sparks: Tell them to turn off at the breaker, evacuate if needed, call 911.

FORMATTING:
- Max 320 characters total (diagnosis + slot offer combined)
- No markdown, no asterisks, plain SMS text
- Warm, human tone — not robotic, not salesy
- End with the slot offer: "Available times: 1) ... 2) ... 3) ... Reply 1, 2, or 3."
- If it's a serious safety issue, DO NOT include slot options — just the safety instruction.

SLOTS AVAILABLE:
${slotOptions}`;

      const result = await callClaude(
        [{ role: 'user', content: serviceText }],
        [],
        diagnosticSystem
      );

      const reply = result.content?.[0]?.text?.trim();
      if (reply && reply.length > 0) {
        // Safety check: if the reply tells them to leave/call 911, don't add slots
        const isSafetyOverride = /911|leave.*home|evacuate|gas company/i.test(reply);
        if (isSafetyOverride) {
          await updateSession(session.id, { state: 'confirmed' }); // end session on safety
          return reply.slice(0, MAX_CHARS);
        }
        return reply.slice(0, MAX_CHARS);
      }
    } catch (e) {
      console.error('[BRAIN3] Diagnostic generation error:', e.message);
    }
  }

  // Fallback if no knowledge / Claude unavailable
  return `Got it. ${businessName} has openings: ${slotOptions}. Reply 1, 2, or 3.`;
}

// ── Step 3: Confirm slot pick ─────────────────────────────────────────────────
async function handleSlotPick(session, contractor, businessName, text) {
  let offeredSlots = [];
  try { offeredSlots = JSON.parse(session.offered_slots || '[]'); } catch (e) {}

  // Parse reply: "1", "2", "3", or a time string
  const pick = text.trim();
  let chosen = null;

  const num = parseInt(pick);
  if (!isNaN(num) && num >= 1 && num <= offeredSlots.length) {
    chosen = offeredSlots[num - 1];
  } else {
    // Try to match by partial text
    const lower = pick.toLowerCase();
    chosen = offeredSlots.find(s => s.label.toLowerCase().includes(lower));
  }

  if (!chosen) {
    const options = offeredSlots.map((s, i) => `${i + 1}) ${s.label}`).join('  ');
    return `Reply 1, 2, or 3: ${options}`;
  }

  // ── Book the appointment ────────────────────────────────────────────────────
  try {
    const name = session.name || 'Homeowner';
    let leadId = session.lead_id || null;

    if (leadId) {
      // Lead already created (phone-only form path) — just update status + fill in name/address
      await db.query(
        `UPDATE leads SET status = 'matched', assigned_contractor_id = $1,
         name = COALESCE(NULLIF($2,'Homeowner'), name),
         address = COALESCE($3, address)
         WHERE id = $4`,
        [contractor.id, name, session.address || null, leadId]
      );
    } else {
      // Create lead (missed call / van wrap / Facebook Lead Ad / direct SMS path)
      const niche = await db.prepare(`SELECT id FROM niches WHERE id = $1`).get(contractor.niche_id);
      const nicheId = niche?.id || (await db.prepare(`SELECT id FROM niches WHERE name = 'HVAC'`).get())?.id;
      if (!nicheId) throw new Error('No niche found');

      leadId = uuidv4();
      await db.prepare(`
        INSERT INTO leads
          (id, name, email, phone, niche_id, zip_code, address, description, status, assigned_contractor_id, source_site)
        VALUES
          ($1, $2, NULL, $3, $4, 'sms', $5, $6, 'matched', $7, 'sms_brain3')
      `).run(
        leadId,
        name,
        session.phone,
        nicheId,
        session.address || '',
        session.service_description || 'HVAC service',
        contractor.id
      );
    }

    // Create appointment
    const apptId = uuidv4();
    await db.query(`
      INSERT INTO appointments
        (id, lead_id, contractor_id, scheduled_date, scheduled_time, status, booking_source)
      VALUES
        ($1, $2, $3, $4, $5, 'confirmed', 'sms_brain3')
    `, [apptId, leadId, contractor.id, chosen.date, chosen.time]);

    // Transition to email capture before final close
    await updateSession(session.id, { state: 'awaiting_email', lead_id: leadId });

    // Alert Jose + contractor
    try {
      const notifications = require('./notifications');
      const apptForAlert = {
        id: apptId,
        scheduled_date: chosen.date,
        scheduled_time: chosen.time,
        booking_source: 'sms_brain3',
      };
      const homeowner = { name, phone: session.phone, address: session.address };
      // Fire booking alert to Jose
      await notifications.sendTrialBookingAlertToJose({
        contractor,
        homeowner,
        date: chosen.date,
        time: chosen.time,
        bookingSource: 'sms_brain3',
        bookingNumber: null,
      }).catch(e => console.error('[BRAIN3] Jose alert failed:', e.message));
    } catch (e) {
      console.error('[BRAIN3] Notification error:', e.message);
    }

    // SMS contractor
    try {
      const twilio = require('twilio');
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && contractor.twilio_number) {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const addr = session.address || 'address not captured';
        const mapsLink = session.address
          ? `maps.apple.com/?daddr=${encodeURIComponent(session.address)}`
          : null;
        let contractorMsg = `New booking! ${name} · ${session.phone} · ${fmtDate(chosen.date)} ${fmtTime(chosen.time)} · ${addr}`;
        if (mapsLink) contractorMsg += ` · ${mapsLink}`;
        await client.messages.create({
          to: contractor.phone,
          from: contractor.twilio_number,
          body: contractorMsg.slice(0, 500),
        });
      }
    } catch (e) {
      console.error('[BRAIN3] Contractor SMS alert failed:', e.message);
    }

    const addrPart = session.address ? ` at ${session.address}` : '';
    return `Confirmed! ${businessName} will be there${addrPart} on ${fmtDate(chosen.date)} at ${fmtTime(chosen.time)}. Want a confirmation email? Reply with your email or SKIP.`;

  } catch (err) {
    console.error('[BRAIN3] Booking error:', err.message);
    return `Something went wrong on our end — we'll reach out to confirm your appointment. Sorry about that!`;
  }
}

// ── Step 4: Capture email (optional) ────────────────────────────────────────
async function handleEmail(session, contractor, businessName, text) {
  const input = text.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const skipWords  = /^(skip|no|nope|none|n\/a|na)$/i;

  const socialReply = /^(thanks?|ok|okay|great|sounds?\s*good|perfect|awesome|got\s*it|👍|thx|ty|yep|yup|sure|cool|nice|wonderful)$/i;

  if (skipWords.test(input) || socialReply.test(input)) {
    await updateSession(session.id, { state: 'confirmed' });
    return `No problem! Your booking is confirmed. ${businessName} will remind you the morning of your appointment. Reply STOP to opt out.`;
  }

  if (!emailRegex.test(input)) {
    // Not a valid email and not a skip/social word — ask once more
    return `Just reply with your email address or SKIP if you'd rather not.`;
  }

  // Valid email — save and send confirmation
  await updateSession(session.id, { state: 'confirmed', email: input });

  if (session.lead_id) {
    db.query(`UPDATE leads SET email = $1 WHERE id = $2`, [input, session.lead_id])
      .catch(e => console.error('[BRAIN3] Email save error:', e.message));
  }

  // Look up the appointment to populate the confirmation email
  try {
    const appt = await db.prepare(`
      SELECT scheduled_date, scheduled_time
      FROM appointments
      WHERE lead_id = $1 AND contractor_id = $2 AND status = 'confirmed'
      ORDER BY created_at DESC LIMIT 1
    `).get(session.lead_id, contractor.id);

    if (appt) {
      const notifications = require('./notifications');
      notifications.sendBrain3BookingConfirmation({
        to: input,
        name: session.name || 'there',
        businessName,
        date: fmtDate(appt.scheduled_date),
        time: fmtTime(appt.scheduled_time),
        address: session.address || '',
      }).catch(e => console.error('[BRAIN3] Confirmation email error:', e.message));
    }
  } catch (e) {
    console.error('[BRAIN3] Email confirmation lookup error:', e.message);
  }

  return `Done! Check ${input} for your confirmation. See you at the appointment!`;
}

// ── Public: start a new homeowner session ─────────────────────────────────────
// Called from twilio.js (missed call), facebook.js (Lead Ad), and leads.js (phone-only form)
// Detects returning homeowners and pre-populates name + address.
async function startHomeownerSession(phone, contractorId, name = null, leadId = null) {
  // Kill any stale session for this phone + contractor first
  await db.query(`
    UPDATE homeowner_sms_sessions
    SET state = 'confirmed', updated_at = NOW()
    WHERE phone = $1 AND contractor_id = $2 AND state != 'confirmed'
  `, [phone, contractorId]).catch(() => {});

  // Returning homeowner check — if they've booked before, pre-populate and skip address
  const lastBooking = await getLastConfirmedBooking(phone, contractorId);
  if (lastBooking && lastBooking.name && lastBooking.address) {
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO homeowner_sms_sessions
        (id, phone, contractor_id, state, name, address, offered_slots, lead_id)
      VALUES ($1, $2, $3, 'awaiting_service', $4, $5, '[]', $6)
    `).run(id, phone, contractorId, lastBooking.name, lastBooking.address, leadId);
    return { isReturning: true, ...(await db.prepare(`SELECT * FROM homeowner_sms_sessions WHERE id = $1`).get(id)) };
  }

  const session = await createSession(phone, contractorId, name, leadId);
  return { isReturning: false, ...session };
}

// ── Public: get active session ────────────────────────────────────────────────
async function getActiveSession(phone, contractorId) {
  return getSession(phone, contractorId);
}

// ── Public: route an inbound homeowner SMS ────────────────────────────────────
async function routeHomeownerSms(phone, contractorId, text) {
  const session = await getSession(phone, contractorId);
  if (!session) return null; // No active session — caller handles fallback
  return handleHomeownerSms(phone, contractorId, text, session);
}

// ── Public: start a rebook session after cancellation ────────────────────────
// Pre-populates name, address, service from the lead and jumps straight to
// slot selection. Returns the SMS text to send, or null if no slots available.
async function startRebookSession(phone, contractorId, lead) {
  // Expire any existing session
  await db.query(`
    UPDATE homeowner_sms_sessions
    SET state = 'confirmed', updated_at = NOW()
    WHERE phone = $1 AND contractor_id = $2 AND state != 'confirmed'
  `, [phone, contractorId]).catch(() => {});

  // Fetch open slots
  const slots = await getOpenSlots(contractorId);
  if (!slots.length) return null; // No slots — caller falls back to email

  const offered = slots.slice(0, 3);
  const sessionId = uuidv4();
  await db.prepare(`
    INSERT INTO homeowner_sms_sessions
      (id, phone, contractor_id, state, name, address, service_description, offered_slots, lead_id)
    VALUES ($1, $2, $3, 'awaiting_slot', $4, $5, $6, $7, $8)
  `).run(
    sessionId, phone, contractorId,
    lead.name || null,
    lead.address || null,
    'rebooking',
    JSON.stringify(offered),
    lead.id || null,
  );

  const options = offered.map((s, i) => `${i + 1}) ${s.label}`).join('  ');
  return `Want to get rebooked? Here are the next available times: ${options}. Reply 1, 2, or 3.`;
}

module.exports = {
  startHomeownerSession,
  getActiveSession,
  routeHomeownerSms,
  startRebookSession,
  getLastConfirmedBooking,
};
