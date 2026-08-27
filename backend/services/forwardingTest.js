/**
 * forwardingTest.js — Automated call-forwarding verification (session 28)
 *
 * The problem: contractors set up call forwarding by dialing a carrier code
 * (or, on Android, a real menu toggle). There's no on-screen confirmation from
 * the carrier either way. Previously the drip just asked the contractor to
 * manually call themselves from a second phone and self-report — unreliable,
 * and the one time it actually mattered (Jose's own live test), the code was
 * set up wrong (unconditional instead of conditional) and nobody caught it
 * until a real call silently never rang.
 *
 * The fix: Tractify places a real outbound call to the contractor's own
 * number the moment they say they've set it up, and measures how long it
 * takes before that call shows up back on the Twilio side (forwarded):
 *
 *   - Forwarded call arrives within ~5 seconds of the outbound call starting
 *     → forwarding is UNCONDITIONAL (every call redirects instantly, no
 *       ringing) — exactly the bug that broke Jose's phone. Flag immediately.
 *   - Forwarded call arrives after several rings (5+ seconds, typically
 *     15-25s) → forwarding is CONDITIONAL and correct. Mark the step done.
 *   - Nothing ever forwards, and the outbound call's own status comes back
 *     as answered/no-answer/busy (meaning it genuinely rang their real phone
 *     and nothing redirected it) → forwarding was never actually turned on.
 *   - Nothing resolves within ~2 minutes → timeout, ask them to try again.
 *
 * This removes both weak points in the old manual-test approach: it no longer
 * depends on the contractor owning a second phone or a willing friend, and it
 * no longer depends on them noticing something's wrong — Tractify catches the
 * dangerous "unconditional" case automatically, before it becomes a real
 * broken phone line or a support problem.
 */

const db = require('../database/db');

const UNCONDITIONAL_THRESHOLD_MS = 5000; // forwarded back this fast = never actually rang = unconditional
const TEST_WINDOW_MS = 90 * 1000;        // how long an inbound call can be attributed to an in-flight test

/**
 * Kick off a forwarding test. Places a real outbound call from the
 * contractor's Twilio number to their real business number. The result is
 * resolved asynchronously by whichever webhook fires first:
 *   - /api/twilio/missed-call (the outbound call got forwarded back to us)
 *   - /api/twilio/forwarding-test-status (the outbound call's own status —
 *     it actually rang/was answered/went unanswered on their real phone,
 *     meaning nothing forwarded it away)
 *
 * Returns { started: true } or { started: false, reason } — never throws,
 * since this runs inline inside a live SMS conversation and a failure here
 * should degrade gracefully (fall back to "text me once you've tested it").
 */
async function startForwardingTest(contractor) {
  const numberToTest = contractor.business_phone || contractor.phone;
  if (!numberToTest || !contractor.twilio_number) {
    return { started: false, reason: 'missing_number' };
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    return { started: false, reason: 'twilio_not_configured' };
  }

  // Live-caught real bug (task #69): sending "Done" twice quickly called this
  // function twice, and each call schedules its OWN real outbound test call
  // ~18s later with zero awareness of the other — the contractor's phone rang
  // twice within seconds for what should have been a single test. Refuse to
  // start a second test while one genuinely appears to be in flight (started
  // recently and hasn't resolved yet). Window covers the 18s scheduling delay
  // plus the ~90s resolution window plus padding.
  const inFlightCheck = await db.prepare(
    'SELECT fwd_test_started_at, fwd_test_result FROM contractors WHERE id = $1'
  ).get(contractor.id);
  if (inFlightCheck?.fwd_test_started_at && !inFlightCheck.fwd_test_result) {
    const ageMs = Date.now() - new Date(inFlightCheck.fwd_test_started_at).getTime();
    if (ageMs < 130000) {
      return { started: false, reason: 'already_in_progress' };
    }
  }

  try {
    await db.query(
      `UPDATE contractors SET fwd_test_started_at = NOW(), fwd_test_result = NULL, fwd_test_completed_at = NULL WHERE id = $1`,
      [contractor.id]
    );

    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const baseUrl = process.env.FRONTEND_URL;

    const testTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Hi, this is an automated test call from Tractify checking your call forwarding setup. If you're hearing this, forwarding isn't catching this call yet — no action needed right now, we'll text you what to do next. Goodbye.</Say><Hangup/></Response>`;

    // Fired ~18s after Brain 2 tells the contractor a test is coming, not
    // immediately. Live-caught real bug (Jose's own test): at 10s, the text
    // landed and the call rang almost on top of each other — he hadn't
    // finished reading "don't answer it" before his phone was already
    // ringing, and answered on reflex. That single answered-then-hung-up
    // call reads identically to "forwarding never caught this at all" (see
    // resolveFromOutboundStatus below), producing a false not_forwarding
    // result even though forwarding was actually set up correctly. Widened
    // to 18s for real reading time between the warning landing and the
    // phone actually ringing.
    setTimeout(() => {
      client.calls.create({
        to: numberToTest,
        from: contractor.twilio_number,
        twiml: testTwiml,
        statusCallback: `${baseUrl}/api/twilio/forwarding-test-status?contractorId=${contractor.id}`,
        statusCallbackEvent: ['completed'],
        statusCallbackMethod: 'POST',
        timeout: 25, // ring for up to 25s before Twilio gives up — long enough to prove conditional forwarding waited
      }).then(() => {
        console.log(`[FWD-TEST] Test call placed for contractor ${contractor.id} (${contractor.company_name || contractor.name}) → ${numberToTest}`);
      }).catch(err => {
        console.error(`[FWD-TEST] Delayed test call failed for contractor ${contractor.id}:`, err.message);
      });
    }, 18000);

    console.log(`[FWD-TEST] Scheduled for contractor ${contractor.id} (${contractor.company_name || contractor.name}) → ${numberToTest} (firing in 18s)`);
    return { started: true };
  } catch (err) {
    console.error('[FWD-TEST] Failed to start:', err.message);
    return { started: false, reason: err.message };
  }
}

/**
 * Called from the /missed-call webhook when an inbound (forwarded) call
 * arrives and there's an in-flight test for that contractor. Atomically
 * claims the result (WHERE fwd_test_result IS NULL) so a race with the
 * status-callback path can't double-resolve it. Returns the computed result
 * string, or null if there was no in-flight test to claim (meaning this is
 * a real homeowner call and the normal missed-call flow should proceed).
 */
async function resolveFromForwardedCall(contractorId) {
  const { rows } = await db.query(
    `SELECT fwd_test_started_at FROM contractors WHERE id = $1`,
    [contractorId]
  );
  const startedAt = rows[0]?.fwd_test_started_at;
  if (!startedAt) return null;

  const elapsedMs = Date.now() - new Date(startedAt).getTime();
  if (elapsedMs > TEST_WINDOW_MS) return null; // stale — too old to be this test, treat as a real call

  const result = elapsedMs < UNCONDITIONAL_THRESHOLD_MS ? 'unconditional_broken' : 'conditional_ok';

  const { rows: claimed } = await db.query(
    `UPDATE contractors SET fwd_test_result = $1, fwd_test_completed_at = NOW()
     WHERE id = $2 AND fwd_test_result IS NULL
     RETURNING id`,
    [result, contractorId]
  );
  if (!claimed.length) return null; // already resolved by the other path — treat as a real call, don't double-fire

  await notifyResult(contractorId, result);
  return result;
}

/**
 * Called from the /forwarding-test-status webhook — the ORIGINAL outbound
 * call's own status. If it actually rang/was answered/went unanswered on
 * their real phone (rather than being redirected away by the carrier),
 * that proves forwarding never activated.
 */
async function resolveFromOutboundStatus(contractorId, callStatus) {
  if (!['completed', 'no-answer', 'busy', 'failed'].includes(callStatus)) return null;

  const { rows } = await db.query(
    `SELECT fwd_test_started_at FROM contractors WHERE id = $1`,
    [contractorId]
  );
  const startedAt = rows[0]?.fwd_test_started_at;
  if (!startedAt) return null;
  if (Date.now() - new Date(startedAt).getTime() > TEST_WINDOW_MS) return null;

  const { rows: claimed } = await db.query(
    `UPDATE contractors SET fwd_test_result = 'not_forwarding', fwd_test_completed_at = NOW()
     WHERE id = $1 AND fwd_test_result IS NULL
     RETURNING id`,
    [contractorId]
  );
  if (!claimed.length) return null; // already resolved by the forwarded-call path — that one wins

  await notifyResult(contractorId, 'not_forwarding');
  return 'not_forwarding';
}

/** Texts the contractor the result and, on success, marks the onboarding step done. */
async function notifyResult(contractorId, result) {
  try {
    const contractor = await db.prepare(`SELECT * FROM contractors WHERE id = $1`).get(contractorId);
    if (!contractor || !contractor.twilio_number) return;

    let body;
    if (result === 'conditional_ok') {
      body = `Good news — I just tested it and it's working correctly. Calls only forward to us after you don't pick up, so nothing changes for calls you do answer. You're all set on this step!`;
      // Mark the 'twilio' onboarding step done, same shape used elsewhere.
      const steps = typeof contractor.onboarding_steps === 'string'
        ? JSON.parse(contractor.onboarding_steps || '{}')
        : (contractor.onboarding_steps || {});
      steps.twilio = true;
      await db.query(`UPDATE contractors SET onboarding_steps = $1 WHERE id = $2`, [JSON.stringify(steps), contractorId]);

      // This message is sent directly via the Twilio API, completely outside
      // the normal AI conversation loop — it has no built-in concept of "next
      // step" the way handleContractorSms does. Found live: a contractor was
      // left stuck after this fired, thinking setup was fully done, with no
      // idea 4 more steps remained. Pull the real next step and append it so
      // this message keeps the same momentum the AI itself would give.
      try {
        const { getNextStepPromptForContractor } = require('./smsAI');
        const next = await getNextStepPromptForContractor(contractorId);
        if (next) {
          // next.text is a fully-composed message (via a real model call in
          // getNextStepPromptForContractor), not the raw internal guide —
          // live-caught bug: pasting the raw guide here sent contractors
          // literal meta-instructions like "Start with why — e.g." instead
          // of an actual message. See the comment on that function.
          body += ` Next up: ${next.text}`;
        } else {
          body += ` That was the last step — all your channels are live!`;
        }
      } catch (e) {
        console.error('[FWD-TEST] Failed to append next-step prompt (non-fatal):', e.message);
      }
    } else if (result === 'unconditional_broken') {
      body = `Heads up — I just tested it and it's set up wrong. Right now EVERY call is forwarding to us immediately, even ones you'd normally answer yourself, so real calls aren't reaching your phone at all. Let's undo that right now, then redo it correctly. Text me and I'll walk you through it.`;
    } else if (result === 'not_forwarding') {
      body = `I just tested it and calls aren't forwarding yet — your phone rang like normal and nothing redirected to us. That usually means either the code didn't go through, or the test call itself got answered/hung up before it could ring long enough to prove it (easy to do by accident — this time, just let it ring through to voicemail on its own without touching it). Text me DONE again once you've dialed the code and I'll test it once more.`;
    } else {
      return;
    }

    const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      to: contractor.phone,
      from: contractor.twilio_number,
      body,
    });

    // Live-caught real bug (task #63): this message is composed and sent
    // completely outside handleContractorSms's loop, so it never touched
    // sms_conversation — the contractor's next reply ("Done" to the appended
    // "Next up: [GBP step]") landed with no record the GBP step was ever
    // asked, and the conversation just stalled with zero response. Same
    // synthetic-pair pattern used for sendWelcomeText, now shared via
    // appendDeterministicSmsTurn so it's safe regardless of what's already
    // in history (always ends on 'assistant', so this keeps alternation valid).
    const { appendDeterministicSmsTurn } = require('./smsAI');
    await appendDeterministicSmsTurn(contractorId, body, `(system: forwarding test resolved — ${result})`);

    console.log(`[FWD-TEST] Result for ${contractorId}: ${result} — contractor notified`);
  } catch (err) {
    console.error('[FWD-TEST] notifyResult failed:', err.message);
  }
}

/**
 * Cron sweep — catches tests that never resolved either way (contractor's
 * phone was off, call never connected at all, webhook lost, etc). Run this
 * every few minutes from cron.js.
 */
async function sweepTimeouts() {
  const { rows } = await db.query(`
    SELECT id FROM contractors
    WHERE fwd_test_started_at IS NOT NULL
      AND fwd_test_result IS NULL
      AND fwd_test_started_at < NOW() - INTERVAL '2 minutes'
  `);
  for (const row of rows) {
    const { rows: claimed } = await db.query(
      `UPDATE contractors SET fwd_test_result = 'timeout', fwd_test_completed_at = NOW()
       WHERE id = $1 AND fwd_test_result IS NULL
       RETURNING id`,
      [row.id]
    );
    if (!claimed.length) continue;
    try {
      const contractor = await db.prepare(`SELECT * FROM contractors WHERE id = $1`).get(row.id);
      if (contractor?.twilio_number && process.env.TWILIO_ACCOUNT_SID) {
        const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          to: contractor.phone,
          from: contractor.twilio_number,
          body: `Still checking on that forwarding test — I didn't get a result back in time, which sometimes just means a bad signal or the call didn't fully go through. No worries, just text DONE again whenever you're ready and I'll try testing it once more.`,
        });
      }
    } catch (e) {
      console.error('[FWD-TEST] sweepTimeouts notify failed:', e.message);
    }
  }
  return rows.length;
}

module.exports = {
  startForwardingTest,
  resolveFromForwardedCall,
  resolveFromOutboundStatus,
  sweepTimeouts,
};
