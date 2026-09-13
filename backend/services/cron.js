/**
 * cron.js — Scheduled background jobs
 *
 * Started once after DB is ready (in server.js).
 * All jobs are fire-and-forget with error isolation so a failing job
 * never crashes the server.
 */

const cron = require('node-cron');
const db = require('../database/db');
const notifications = require('./notifications');
const { logEvent } = require('./auditLog');
const { getLocalNow, resolveContractorTimezone, timeStrToMinutes, daysBetweenDateStrings } = require('./timezone');

// ── Appointment reminders ─────────────────────────────────────────────────────
// Runs every hour at :00. Finds confirmed appointments happening tomorrow
// (within the next 24–25 hours) that haven't had a reminder sent yet.
//
// Session 34/35 (Sept 13) — rewritten to be timezone-aware, same live-caught
// bug class as the post-job/morning-of crons below: the old version built its
// 23h/25h window from the SERVER's own UTC clock (`new Date().toISOString()`)
// and compared it directly against `scheduled_date`/`scheduled_time`, which
// are stored as plain strings meant to be read in the CONTRACTOR's local
// timezone — a mismatch of several hours depending on the server's actual
// clock and the contractor's real timezone. Now fetches a broad 3-day
// candidate window (wide enough to cover any US timezone offset either
// direction of the server's UTC date) and does the real 23–25h check per
// appointment using the contractor's stored timezone.
cron.schedule('0 * * * *', async () => {
  console.log('⏰ [cron] Running appointment reminder check…');
  try {
    const todayUTC = new Date().toISOString().slice(0, 10);
    const [ty, tm, td] = todayUTC.split('-').map(Number);
    const dayBefore = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10);
    const dayAfter  = new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);

    const { rows: appointments } = await db.query(`
      SELECT
        a.id, a.scheduled_date, a.scheduled_time, a.lead_id,
        a.cancel_token, a.reschedule_token,
        l.name  AS lead_name,  l.email AS lead_email,  l.phone AS lead_phone,
        c.name  AS contractor_name, c.email AS contractor_email,
        c.company_name, c.address, c.timezone
      FROM appointments a
      JOIN leads l       ON a.lead_id = l.id
      JOIN contractors c ON a.contractor_id = c.id
      WHERE a.status = 'confirmed'
        AND a.reminder_sent_at IS NULL
        AND a.scheduled_date IN ($1, $2, $3)
    `, [dayBefore, todayUTC, dayAfter]);

    if (!appointments.length) {
      console.log('⏰ [cron] No reminders to send');
      return;
    }

    for (const appt of appointments) {
      try {
        const tz = resolveContractorTimezone(appt);
        const { dateStr: localToday, minutes: nowMinutes } = getLocalNow(tz);
        const apptMinutes = timeStrToMinutes(appt.scheduled_time);
        if (apptMinutes === null) continue;
        const dayDiff = daysBetweenDateStrings(localToday, appt.scheduled_date);
        const minutesUntil = dayDiff * 1440 + (apptMinutes - nowMinutes);
        // 23h–25h window, same as the original design intent
        if (minutesUntil < 23 * 60 || minutesUntil > 25 * 60) continue;

        await notifications.sendAppointmentReminder(appt);
        await db.prepare('UPDATE appointments SET reminder_sent_at = NOW() WHERE id = $1').run(appt.id);
        if (appt.lead_id) {
          logEvent(appt.lead_id, 'reminder_sent', 'system', `24hr reminder sent for ${appt.scheduled_date} at ${appt.scheduled_time}`);
        }
        console.log(`⏰ [cron] Reminder sent — appointment ${appt.id} (${appt.scheduled_date} ${appt.scheduled_time})`);
      } catch (err) {
        console.error(`⏰ [cron] Reminder failed for appointment ${appt.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Reminder job error:', err.message);
  }
});

// ── Onboarding nudge ─────────────────────────────────────────────────────────
// Runs once daily at 10 AM. Finds contractors who started onboarding 48+ hours
// ago but haven't completed all 6 steps — sends nudge to contractor + admins.
cron.schedule('0 10 * * *', async () => {
  console.log('⏰ [cron] Running onboarding nudge check…');
  try {
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { rows: contractors } = await db.query(`
      SELECT id, name, email, company_name, onboarding_steps, twilio_number
      FROM contractors
      WHERE is_active = 1
        AND onboarding_started_at IS NOT NULL
        AND onboarding_started_at < $1
        AND onboarding_nudge_sent_at IS NULL
        AND (
          onboarding_steps IS NULL
          OR NOT (
            (onboarding_steps->>'availability')::boolean = true AND
            (onboarding_steps->>'twilio')::boolean = true AND
            (onboarding_steps->>'gbp')::boolean = true AND
            (onboarding_steps->>'nextdoor')::boolean = true AND
            (onboarding_steps->>'facebook')::boolean = true AND
            (onboarding_steps->>'reviewers')::boolean = true
          )
        )
    `, [cutoff]);

    if (!contractors.length) {
      console.log('⏰ [cron] No onboarding nudges needed');
      return;
    }

    for (const contractor of contractors) {
      try {
        await notifications.sendOnboardingNudge(contractor, contractor.onboarding_steps);
        await db.query(`UPDATE contractors SET onboarding_nudge_sent_at = NOW() WHERE id = $1`, [contractor.id]);
        console.log(`⏰ [cron] Onboarding nudge sent — ${contractor.name} (${contractor.email})`);
      } catch (err) {
        console.error(`⏰ [cron] Nudge failed for ${contractor.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Onboarding nudge job error:', err.message);
  }
});

// ── SMS setup drip ────────────────────────────────────────────────────────────
// Runs hourly. Finds contractors with a Twilio number assigned but with incomplete
// setup steps who haven't received an SMS in the last 24 hours.
// Sends one step-specific text guiding them to the next incomplete action.
// Only fires if TWILIO credentials are set (Twilio compliance approved).
cron.schedule('30 * * * *', async () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;

  try {
    const { rows: candidates } = await db.query(`
      SELECT id, name, email, phone, company_name, booking_slug,
             twilio_number, onboarding_steps, sms_welcome_sent,
             last_setup_sms_at, business_phone
      FROM contractors
      WHERE is_active = 1
        AND twilio_number IS NOT NULL
        AND phone IS NOT NULL
        AND sms_welcome_sent = 1
        AND (
          last_setup_sms_at IS NULL
          OR last_setup_sms_at < NOW() - INTERVAL '23 hours'
        )
        AND NOT (
          COALESCE((onboarding_steps->>'availability')::boolean, false) = true AND
          COALESCE((onboarding_steps->>'twilio')::boolean, false) = true AND
          COALESCE((onboarding_steps->>'gbp')::boolean, false) = true AND
          COALESCE((onboarding_steps->>'nextdoor')::boolean, false) = true AND
          COALESCE((onboarding_steps->>'facebook')::boolean, false) = true AND
          COALESCE((onboarding_steps->>'reviewers')::boolean, false) = true AND
          COALESCE((onboarding_steps->>'messenger')::boolean, false) = true
        )
    `);

    if (!candidates.length) return;

    const twilio = require('twilio');
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const { sendSetupStepText } = require('./smsAI');

    for (const contractor of candidates) {
      try {
        const stepSent = await sendSetupStepText(contractor, twilioClient);
        if (stepSent) {
          console.log(`⏰ [cron] Setup drip sent to ${contractor.name} — step: ${stepSent}`);
        }
      } catch (err) {
        console.error(`⏰ [cron] Setup drip failed for ${contractor.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Setup drip job error:', err.message);
  }
});

// ── 72-hour silence alert ─────────────────────────────────────────────────────
// Runs every 6 hours. Finds active trial contractors who have been live for 72+
// hours with zero confirmed bookings — fires a single email alert to Jose.
// The column trial_silence_alert_sent_at prevents duplicate alerts.
cron.schedule('0 */6 * * *', async () => {
  try {
    const cutoff72h = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

    const { rows: silent } = await db.query(`
      SELECT c.id, c.name, c.email, c.company_name, c.booking_slug,
             c.created_at,
             EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600 AS hours_live
      FROM contractors c
      WHERE c.is_active = 1
        AND c.created_at < $1
        AND c.trial_silence_alert_sent_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.contractor_id = c.id
            AND a.status != 'cancelled'
        )
    `, [cutoff72h]);

    if (!silent.length) return;

    for (const contractor of silent) {
      try {
        await notifications.sendTrialSilenceAlertToJose({
          contractor,
          hoursSinceDeploy: parseFloat(contractor.hours_live),
        });
        await db.query('UPDATE contractors SET trial_silence_alert_sent_at = NOW() WHERE id = $1', [contractor.id]);
        console.log(`⏰ [cron] 72h silence alert sent — ${contractor.name} (${Math.round(contractor.hours_live)}h live, 0 bookings)`);
      } catch (err) {
        console.error(`⏰ [cron] Silence alert failed for ${contractor.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Silence alert job error:', err.message);
  }
});

// ── 21-day trial heads-up ─────────────────────────────────────────────────────
// Added session 34/35 (Sept 13) — CLAUDE.md STEP 2e. Finds trial contractors
// who are 18+ days live, still under 5 non-cancelled bookings, and haven't
// already gotten the heads-up — sends the soft "just keeping you in the
// loop" text so the day-21 offer never feels sudden. trial_heads_up_sent_at
// guards against sending it twice.
//
// Originally scheduled '0 12 * * *' (once daily at server-clock noon) — fixed
// same session as the post-job/morning-of timezone bug below, before this
// ever ran against a real contractor: server noon is not the contractor's
// local noon, so this would have sent the heads-up at whatever odd local
// hour the server's own clock happened to map to for that contractor. Now
// runs hourly and only sends once the contractor's own local clock reads a
// reasonable daytime hour (9 AM–6 PM) — trial_heads_up_sent_at still only
// lets it fire once, so this doesn't need to be a tight minute-level window.
cron.schedule('0 * * * *', async () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;

  try {
    const cutoff18d = new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString();

    const { rows: candidates } = await db.query(`
      SELECT c.*, COUNT(a.id) FILTER (WHERE a.status != 'cancelled') as job_count
      FROM contractors c
      LEFT JOIN appointments a ON a.contractor_id = c.id
      WHERE c.is_active = 1
        AND c.payment_status = 'trial'
        AND c.twilio_number IS NOT NULL
        AND c.phone IS NOT NULL
        AND c.trial_heads_up_sent_at IS NULL
        AND c.trial_offer_sent_at IS NULL
        AND c.created_at < $1
      GROUP BY c.id
      HAVING COUNT(a.id) FILTER (WHERE a.status != 'cancelled') < 5
    `, [cutoff18d]);

    if (!candidates.length) return;

    const twilio = require('twilio');
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const { sendTrialHeadsUpText } = require('./smsAI');

    for (const contractor of candidates) {
      try {
        const { minutes: nowMinutes } = getLocalNow(resolveContractorTimezone(contractor));
        if (nowMinutes < 9 * 60 || nowMinutes > 18 * 60) continue;

        await sendTrialHeadsUpText(contractor, parseInt(contractor.job_count, 10), twilioClient);
        console.log(`⏰ [cron] Trial heads-up sent — ${contractor.name} (${contractor.job_count}/5 jobs, 18+ days live)`);
      } catch (err) {
        console.error(`⏰ [cron] Trial heads-up failed for ${contractor.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Trial heads-up job error:', err.message);
  }
});

// ── 5-job-or-21-day trial trigger ─────────────────────────────────────────────
// Added session 34/35 (Sept 13) — CLAUDE.md STEP 2e, the "actual next step"
// locked after the two remaining real-phone tests were deferred. Runs every
// 2 hours. Finds trial contractors who've hit EITHER 5 non-cancelled bookings
// OR 21 days live, whichever came first, and haven't already gotten the offer.
// Detection + SMS only — no Stripe/payment collection exists yet (STEP 3).
// If pricing_bucket is unset (niches the flat-retainer model never explicitly
// bucketed — see services/pricingBuckets.js), this does NOT guess a price —
// it alerts Jose instead and leaves trial_offer_sent_at untouched, so the
// very next cron run retries automatically once he sets a bucket.
cron.schedule('0 */2 * * *', async () => {
  try {
    const cutoff21d = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();

    const { rows: candidates } = await db.query(`
      SELECT c.*, n.name as niche_name,
             COUNT(a.id) FILTER (WHERE a.status != 'cancelled') as job_count,
             EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400 as days_live
      FROM contractors c
      LEFT JOIN niches n ON c.niche_id = n.id
      LEFT JOIN appointments a ON a.contractor_id = c.id
      WHERE c.is_active = 1
        AND c.payment_status = 'trial'
        AND c.trial_offer_sent_at IS NULL
      GROUP BY c.id, n.name
      HAVING
        COUNT(a.id) FILTER (WHERE a.status != 'cancelled') >= 5
        OR c.created_at < $1
    `, [cutoff21d]);

    if (!candidates.length) return;

    const notifications = require('./notifications');
    const { formatBucketPricing } = require('./pricingBuckets');

    const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
    const twilio = hasTwilio ? require('twilio') : null;
    const twilioClient = hasTwilio ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;
    const { sendTrialOfferText } = hasTwilio ? require('./smsAI') : {};

    for (const contractor of candidates) {
      const jobCount = parseInt(contractor.job_count, 10);
      const daysLive = Math.round(parseFloat(contractor.days_live) * 10) / 10;
      const triggeredBy = jobCount >= 5 ? `5 jobs booked` : `21-day cap (${daysLive} days live)`;

      try {
        if (!contractor.pricing_bucket) {
          // No bucket assigned — alert Jose once, don't guess a price, don't
          // mark trial_offer_sent_at so this retries automatically once fixed.
          if (!contractor.trial_bucket_needed_alert_sent_at) {
            await notifications.sendTrialBucketNeededAlertToJose({ contractor, jobCount, daysLive, triggeredBy });
            await db.query('UPDATE contractors SET trial_bucket_needed_alert_sent_at = NOW() WHERE id = $1', [contractor.id]);
            console.log(`⏰ [cron] Trial trigger hit but no pricing_bucket set — alerted Jose — ${contractor.name} (${triggeredBy})`);
          }
          continue;
        }

        if (!hasTwilio || !contractor.twilio_number || !contractor.phone) {
          console.log(`⏰ [cron] Trial trigger hit for ${contractor.name} (${triggeredBy}) but Twilio isn't configured/assigned — skipping SMS`);
          continue;
        }

        await sendTrialOfferText(contractor, contractor.pricing_bucket, twilioClient);
        await notifications.sendTrialOfferSentNoticeToJose({
          contractor,
          jobCount,
          daysLive,
          triggeredBy,
          priceLine: formatBucketPricing(contractor.pricing_bucket),
        }).catch(err => console.error(`⏰ [cron] Trial offer admin notice failed for ${contractor.id}:`, err.message));

        console.log(`⏰ [cron] Trial offer sent — ${contractor.name} (${triggeredBy}, bucket ${contractor.pricing_bucket})`);
      } catch (err) {
        console.error(`⏰ [cron] Trial trigger failed for ${contractor.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Trial trigger job error:', err.message);
  }
});

// ── Post-appointment close tracking ──────────────────────────────────────────
// Runs hourly at :45. Finds confirmed appointments that ended 30-90 minutes ago
// with no outcome logged yet and a contractor with an active Twilio number.
// Texts the contractor: "How'd it go? Did the job close? Reply YES $amount or NO."
//
// Session 34/35 (Sept 13) — REWRITTEN after a real live-caught bug, reported
// directly by Jose: a Pacific-timezone contractor with a 10:00 AM appointment
// got this "how'd the 10am job go?" text at ~7:30 AM — 3 hours before the job
// even happened. Root cause: `windowStart.getHours()`/`getMinutes()` return
// the Node PROCESS's own local wall-clock time (whatever timezone the server
// container happens to be running in — effectively Eastern here), not UTC and
// not the contractor's timezone, then that gets compared directly against
// `scheduled_time`, which is a plain string meant to be read in the
// CONTRACTOR's own local time. Two different clocks being compared as if
// they were the same one. Fixed by fetching a broad 2-day candidate window
// (covers any US timezone either side of the server's UTC date) and doing
// the real 30-90-minutes-ago check per appointment using the contractor's
// stored timezone (contractors.timezone, added this same session — falls
// back to deriving one from the address for contractors created before that
// column existed).
cron.schedule('45 * * * *', async () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;

  try {
    const todayUTC = new Date().toISOString().slice(0, 10);
    const [ty, tm, td] = todayUTC.split('-').map(Number);
    const dayBefore = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10);

    const { rows: appts } = await db.query(`
      SELECT a.id, a.scheduled_date, a.scheduled_time, a.status,
             l.name as lead_name,
             c.id as contractor_id, c.name as contractor_name, c.phone as contractor_phone,
             c.company_name, c.twilio_number, c.booking_slug, c.sms_welcome_sent,
             c.address, c.timezone
      FROM appointments a
      LEFT JOIN leads l ON a.lead_id = l.id
      JOIN contractors c ON a.contractor_id = c.id
      WHERE a.scheduled_date IN ($1, $2)
        AND a.status IN ('confirmed', 'pending')
        AND a.did_close IS NULL
        AND a.post_job_sms_sent_at IS NULL
        AND a.lead_id IS NOT NULL
        AND c.twilio_number IS NOT NULL
        AND c.phone IS NOT NULL
        AND c.sms_welcome_sent = 1
    `, [dayBefore, todayUTC]);

    if (!appts.length) return;

    const twilio = require('twilio');
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const { sendPostAppointmentText } = require('./smsAI');

    for (const appt of appts) {
      try {
        const tz = resolveContractorTimezone(appt);
        const { dateStr: localToday, minutes: nowMinutes } = getLocalNow(tz);
        const apptMinutes = timeStrToMinutes(appt.scheduled_time);
        if (apptMinutes === null || appt.scheduled_date !== localToday) continue;
        const elapsed = nowMinutes - apptMinutes;
        if (elapsed < 30 || elapsed > 90) continue;

        const contractor = {
          id: appt.contractor_id,
          name: appt.contractor_name,
          phone: appt.contractor_phone,
          company_name: appt.company_name,
          twilio_number: appt.twilio_number,
          booking_slug: appt.booking_slug,
        };
        await sendPostAppointmentText(appt, contractor, twilioClient);
        console.log(`⏰ [cron] Post-job check-in sent — appointment ${appt.id} (${appt.contractor_name})`);
      } catch (err) {
        console.error(`⏰ [cron] Post-job check-in failed for appointment ${appt.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Post-job check-in job error:', err.message);
  }
});

// ── Morning-of confirmation SMS ───────────────────────────────────────────────
// Texts homeowners whose appointment is TODAY (in the CONTRACTOR's own local
// time) so they can confirm or cancel early. Reply CANCEL cancels and
// triggers a rebook. Uses pre_appt_sms_sent_at to prevent duplicate sends.
//
// Session 34/35 (Sept 13) — REWRITTEN, same live-caught timezone bug as the
// post-job cron above: this used to run once at a fixed server-clock 7:30
// and match purely on the server's UTC date, so a contractor outside the
// server's own timezone got this text at the wrong LOCAL hour entirely (and,
// near a UTC midnight boundary, could match the wrong calendar day too).
// Now runs every 15 minutes and only sends to a contractor whose *local*
// clock is currently in the 7:15–7:30 AM window, checked against that
// contractor's real local date.
cron.schedule('*/15 * * * *', async () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;

  try {
    const todayUTC = new Date().toISOString().slice(0, 10);
    const [ty, tm, td] = todayUTC.split('-').map(Number);
    const dayBefore = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10);
    const dayAfter  = new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);

    const { rows: appts } = await db.query(`
      SELECT a.id, a.scheduled_date, a.scheduled_time,
             l.name AS lead_name, l.phone AS lead_phone, l.id AS lead_id,
             c.id AS contractor_id, c.company_name, c.name AS contractor_name,
             c.twilio_number, c.address, c.timezone
      FROM appointments a
      JOIN leads l       ON a.lead_id = l.id
      JOIN contractors c ON a.contractor_id = c.id
      WHERE a.scheduled_date IN ($1, $2, $3)
        AND a.status = 'confirmed'
        AND a.pre_appt_sms_sent_at IS NULL
        AND l.phone IS NOT NULL
        AND c.twilio_number IS NOT NULL
    `, [dayBefore, todayUTC, dayAfter]);

    if (!appts.length) return;

    const twilio = require('twilio');
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    for (const appt of appts) {
      try {
        const tz = resolveContractorTimezone(appt);
        const { dateStr: localToday, minutes: nowMinutes } = getLocalNow(tz);
        // 7:15–7:30 AM local window (15-min cadence, inclusive both ends so
        // no run can skip past it under normal clock drift).
        if (nowMinutes < 7 * 60 + 15 || nowMinutes > 7 * 60 + 30) continue;
        if (appt.scheduled_date !== localToday) continue;

        const firstName = appt.lead_name ? appt.lead_name.split(' ')[0] : null;
        const business  = appt.company_name || appt.contractor_name;
        const greeting  = firstName ? `Hey ${firstName}! ` : 'Hey! ';
        const timeLabel = appt.scheduled_time.replace(/^0/, '').replace(':00', '');
        const body = `${greeting}Just confirming your appointment with ${business} today at ${timeLabel}. Reply CANCEL if you need to cancel.`;

        const digits = appt.lead_phone.replace(/\D/g, '');
        const e164   = digits.length === 10 ? `+1${digits}` : `+${digits}`;

        await twilioClient.messages.create({
          to:   e164,
          from: appt.twilio_number,
          body,
        });
        await db.prepare('UPDATE appointments SET pre_appt_sms_sent_at = NOW() WHERE id = $1').run(appt.id);
        console.log(`⏰ [cron] Morning-of confirmation sent — appt ${appt.id} (${appt.lead_name}, ${appt.scheduled_time})`);
      } catch (err) {
        console.error(`⏰ [cron] Morning-of SMS failed for appt ${appt.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Morning-of confirmation job error:', err.message);
  }
});

// ── Post-appointment review request SMS ───────────────────────────────────────
// Runs hourly at :50. Finds appointments marked 'completed' 2-4 hours ago where
// homeowner has a phone + contractor has a Twilio number + place_id is set.
// Texts homeowner a Google review request with a direct link.
// Uses homeowner_review_sms_sent_at to prevent duplicate sends.
cron.schedule('50 * * * *', async () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;

  try {
    const { rows: appts } = await db.query(`
      SELECT a.id, a.scheduled_date, a.scheduled_time,
             l.name AS lead_name, l.phone AS lead_phone,
             c.id AS contractor_id, c.company_name, c.name AS contractor_name,
             c.twilio_number, c.place_id
      FROM appointments a
      JOIN leads l       ON a.lead_id = l.id
      JOIN contractors c ON a.contractor_id = c.id
      WHERE a.status = 'completed'
        AND a.homeowner_review_sms_sent_at IS NULL
        AND a.updated_at >= NOW() - INTERVAL '4 hours'
        AND a.updated_at <  NOW() - INTERVAL '2 hours'
        AND l.phone IS NOT NULL
        AND c.twilio_number IS NOT NULL
        AND c.place_id IS NOT NULL
    `);

    if (!appts.length) return;

    const twilio = require('twilio');
    const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    for (const appt of appts) {
      try {
        const firstName   = appt.lead_name ? appt.lead_name.split(' ')[0] : null;
        const business    = appt.company_name || appt.contractor_name;
        const greeting    = firstName ? `Hey ${firstName}! ` : 'Hey! ';
        const reviewLink  = `https://search.google.com/local/writereview?placeid=${appt.place_id}`;
        const body = `${greeting}Hope the service with ${business} went great! A quick Google review would mean a lot to them — takes 30 seconds: ${reviewLink} Reply STOP to opt out.`;

        const digits = appt.lead_phone.replace(/\D/g, '');
        const e164   = digits.length === 10 ? `+1${digits}` : `+${digits}`;

        await twilioClient.messages.create({
          to:   e164,
          from: appt.twilio_number,
          body,
        });
        await db.prepare('UPDATE appointments SET homeowner_review_sms_sent_at = NOW() WHERE id = $1').run(appt.id);
        console.log(`⏰ [cron] Review request SMS sent — appt ${appt.id} (${appt.lead_name})`);
      } catch (err) {
        console.error(`⏰ [cron] Review SMS failed for appt ${appt.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Review request SMS job error:', err.message);
  }
});

// ── Twilio pool — "gone dark" auto-release ────────────────────────────────────
// Runs daily at 2am. Session 27 (August 17, 2026) — see backend/services/twilioPool.js
// and CLAUDE.md STEP 2a: numbers assigned to a trial contractor should release
// back to the pool automatically if the contractor never engages. Task #10 (the
// dedicated 5-jobs-or-21-days trial trigger) will eventually own the primary
// trial-expiry release path — this is a broader safety net underneath that for
// accounts that go completely silent well past any reasonable trial window:
// live 30+ days, never converted, zero bookings ever. Adjust the 30-day window
// down to match #10's 21-day trigger once that's built, if it turns out this
// net is catching contractors #10 should have already released.
cron.schedule('0 2 * * *', async () => {
  console.log('⏰ [cron] Running Twilio pool "gone dark" sweep…');
  try {
    const cutoff30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const { rows: dark } = await db.query(`
      SELECT c.id, c.name, c.company_name, c.twilio_pool_id
      FROM contractors c
      WHERE c.twilio_pool_id IS NOT NULL
        AND c.is_active = 1
        AND (c.payment_status IS NULL OR c.payment_status = 'trial')
        AND c.created_at < $1
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.contractor_id = c.id AND a.status != 'cancelled'
        )
    `, [cutoff30d]);

    if (!dark.length) return;

    const { releasePoolNumber } = require('./twilioPool');
    for (const contractor of dark) {
      try {
        const released = await releasePoolNumber(contractor.id, 'inactive_30d');
        if (released) {
          console.log(`⏰ [cron] Released dark trial number — ${contractor.company_name || contractor.name} (30+ days live, 0 bookings)`);
        }
      } catch (err) {
        console.error(`⏰ [cron] Pool release failed for ${contractor.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('⏰ [cron] Twilio pool sweep job error:', err.message);
  }
});

// ── Twilio webhook dedup table prune ──────────────────────────────────────────
// Runs daily at 2:15am. twilio_webhook_events (session 29 continued — see
// routes/twilio.js's claimWebhook()) exists purely to catch a retried webhook
// delivery within the same request cycle; Twilio's actual retry window is
// seconds to low minutes, never days. Without a prune, this table grows by one
// row per real inbound call/text forever. Deleting anything older than 24
// hours is generous padding over the real retry window with zero risk of ever
// deleting a row a live retry still needs to check against.
cron.schedule('15 2 * * *', async () => {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM twilio_webhook_events WHERE created_at < NOW() - INTERVAL '24 hours'`
    );
    if (rowCount) console.log(`⏰ [cron] Pruned ${rowCount} old twilio_webhook_events rows`);
  } catch (err) {
    console.error('⏰ [cron] twilio_webhook_events prune error:', err.message);
  }
});

// ── Call-forwarding test timeout sweep ────────────────────────────────────────
// Runs every 2 minutes. Catches forwarding tests (session 28 —
// services/forwardingTest.js) that never resolved either way within 2 minutes
// (contractor's phone was off, the outbound call never connected, a webhook
// got lost, etc) and lets them know so they aren't left wondering.
cron.schedule('*/2 * * * *', async () => {
  try {
    const { sweepTimeouts } = require('./forwardingTest');
    const n = await sweepTimeouts();
    if (n) console.log(`⏰ [cron] Forwarding-test timeout sweep — resolved ${n} stuck test(s)`);
  } catch (err) {
    console.error('⏰ [cron] Forwarding-test timeout sweep error:', err.message);
  }
});

console.log('✅ Cron jobs started (appointment reminders every hour, onboarding nudge daily at 10am, SMS drip hourly at :30, 72h silence check every 6h, post-job check-in hourly at :45, morning confirmation at 7:30am, review SMS hourly at :50, Twilio pool sweep daily at 2am, forwarding-test timeout sweep every 2min)');
