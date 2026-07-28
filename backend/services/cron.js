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

// ── Appointment reminders ─────────────────────────────────────────────────────
// Runs every hour at :00. Finds confirmed appointments happening tomorrow
// (within the next 24–25 hours) that haven't had a reminder sent yet.
cron.schedule('0 * * * *', async () => {
  console.log('⏰ [cron] Running appointment reminder check…');
  try {
    // Window: 23h from now → 25h from now (catches appointments in the "tomorrow" zone)
    const windowStart = new Date(Date.now() + 23 * 3600 * 1000).toISOString();
    const windowEnd   = new Date(Date.now() + 25 * 3600 * 1000).toISOString();

    // Build date strings for the query — appointments use TEXT dates + times
    const startDate = windowStart.slice(0, 10);
    const endDate   = windowEnd.slice(0, 10);
    const startTime = windowStart.slice(11, 16); // HH:MM
    const endTime   = windowEnd.slice(11, 16);

    const { rows: appointments } = await db.query(`
      SELECT
        a.id, a.scheduled_date, a.scheduled_time, a.lead_id,
        a.cancel_token, a.reschedule_token,
        l.name  AS lead_name,  l.email AS lead_email,  l.phone AS lead_phone,
        c.name  AS contractor_name, c.email AS contractor_email,
        c.company_name
      FROM appointments a
      JOIN leads l       ON a.lead_id = l.id
      JOIN contractors c ON a.contractor_id = c.id
      WHERE a.status = 'confirmed'
        AND a.reminder_sent_at IS NULL
        AND (
          -- Same date: filter by time window
          (a.scheduled_date = $1 AND a.scheduled_time >= $3)
          OR
          -- Next date: filter by time window
          (a.scheduled_date = $2 AND a.scheduled_time <= $4)
          OR
          -- If start and end are the same date
          (a.scheduled_date = $1 AND $1 = $2)
        )
    `, [startDate, endDate, startTime, endTime]);

    if (!appointments.length) {
      console.log('⏰ [cron] No reminders to send');
      return;
    }

    for (const appt of appointments) {
      try {
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
             last_setup_sms_at
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

console.log('✅ Cron jobs started (appointment reminders every hour, onboarding nudge daily at 10am, SMS drip hourly at :30)');
