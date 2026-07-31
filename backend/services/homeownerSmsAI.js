/**
 * homeownerSmsAI.js — Brain 3: Homeowner conversational SMS booking
 *
 * When a homeowner texts a contractor's Twilio number (via missed call, van wrap,
 * Facebook Lead Ad, or any other channel), this brain takes over and books them
 * in a 4-message conversation — entirely over SMS, no browser required.
 *
 * State machine:
 *   awaiting_address  → awaiting_service → awaiting_slot → confirmed
 *
 * The contractor finds out when a push notification hits their phone.
 * The homeowner gets a confirmation text. Nobody did anything manually.
 */

const { v4: uuidv4 } = require('uuid');
const https  = require('https');
const db     = require('../database/db');

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
  // Sessions expire after 2 hours of inactivity
  const session = await db.prepare(`
    SELECT * FROM homeowner_sms_sessions
    WHERE phone = $1 AND contractor_id = $2
    AND updated_at > NOW() - INTERVAL '2 hours'
    AND state != 'confirmed'
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(phone, contractorId);
  return session || null;
}

async function createSession(phone, contractorId, name = null) {
  const id = uuidv4();
  await db.prepare(`
    INSERT INTO homeowner_sms_sessions (id, phone, contractor_id, state, name, offered_slots)
    VALUES ($1, $2, $3, 'awaiting_address', $4, '[]')
  `).run(id, phone, contractorId, name);
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
    `SELECT id, name, company_name, niche_id FROM contractors WHERE id = $1`
  ).get(contractorId);

  if (!contractor) return null;

  const businessName = contractor.company_name || contractor.name || 'us';

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

  // Fallback — session in unknown state, restart
  await updateSession(session.id, { state: 'awaiting_address' });
  return `What address needs service?`;
}

// ── Step 1: Capture address ───────────────────────────────────────────────────
async function handleAddress(session, contractor, businessName, text) {
  // Use Claude Haiku to extract a clean address from whatever they sent
  const system = `You are an address extractor. The user is responding to a question about what address needs HVAC service.
Extract the address from their message. If they gave a clear address (even partial like "123 Main St"), return it as-is.
If the message has no address information at all, return the single word: NONE
Return ONLY the address or NONE. No explanation.`;

  let address = text.trim();
  if (ANTHROPIC_API_KEY) {
    try {
      const result = await callClaude(
        [{ role: 'user', content: text }],
        [],
        system
      );
      const extracted = result.content?.[0]?.text?.trim();
      if (extracted && extracted !== 'NONE') address = extracted;
      else if (extracted === 'NONE') {
        return `Got it — what's the address that needs service?`;
      }
    } catch (e) {
      console.error('[BRAIN3] Address extraction error:', e.message);
    }
  }

  await updateSession(session.id, { address, state: 'awaiting_service' });

  return `Got it. What's going on — AC, heating, or something else?`;
}

// ── Step 2: Capture service type ──────────────────────────────────────────────
async function handleService(session, contractor, businessName, text) {
  await updateSession(session.id, { service_description: text.trim(), state: 'awaiting_slot' });

  // Fetch open slots
  const slots = await getOpenSlots(contractor.id);

  if (!slots.length) {
    // No availability — fall back to booking link
    await updateSession(session.id, { state: 'confirmed' }); // end session
    return `We're fully booked this week but let me have someone reach out to you directly. Sit tight!`;
  }

  // Offer up to 3 slots
  const offered = slots.slice(0, 3);
  await updateSession(session.id, {
    offered_slots: JSON.stringify(offered),
    state: 'awaiting_slot',
  });

  const options = offered.map((s, i) => `${i + 1}) ${s.label}`).join('  ');
  return `${businessName} has openings: ${options}. Reply 1, 2, or 3.`;
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
    // Find HVAC niche (or contractor's niche)
    const niche = await db.prepare(
      `SELECT id FROM niches WHERE id = $1`
    ).get(contractor.niche_id);

    const nicheId = niche?.id || (await db.prepare(`SELECT id FROM niches WHERE name = 'HVAC'`).get())?.id;
    if (!nicheId) throw new Error('No niche found');

    // Create lead
    const leadId = uuidv4();
    const name = session.name || 'Homeowner';
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

    // Create appointment
    const apptId = uuidv4();
    await db.query(`
      INSERT INTO appointments
        (id, lead_id, contractor_id, scheduled_date, scheduled_time, status, booking_source)
      VALUES
        ($1, $2, $3, $4, $5, 'confirmed', 'sms_brain3')
    `, [apptId, leadId, contractor.id, chosen.date, chosen.time]);

    // Mark session confirmed
    await updateSession(session.id, { state: 'confirmed', lead_id: leadId });

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

    return `You're booked! ${businessName} will be at ${session.address || 'your address'} on ${fmtDate(chosen.date)} at ${fmtTime(chosen.time)}. You'll get a reminder the morning of. Reply STOP to opt out.`;

  } catch (err) {
    console.error('[BRAIN3] Booking error:', err.message);
    return `Something went wrong on our end — we'll reach out to confirm your appointment. Sorry about that!`;
  }
}

// ── Public: start a new homeowner session ─────────────────────────────────────
// Called from twilio.js (missed call) and facebook.js (Lead Ad)
async function startHomeownerSession(phone, contractorId, name = null) {
  // Kill any stale session for this phone + contractor first
  await db.query(`
    UPDATE homeowner_sms_sessions
    SET state = 'confirmed', updated_at = NOW()
    WHERE phone = $1 AND contractor_id = $2 AND state != 'confirmed'
  `, [phone, contractorId]).catch(() => {});

  return createSession(phone, contractorId, name);
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

module.exports = {
  startHomeownerSession,
  getActiveSession,
  routeHomeownerSms,
};
