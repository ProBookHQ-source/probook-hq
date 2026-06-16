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

console.log('✅ Cron jobs started (appointment reminders every hour)');
