/**
 * Notifications — powered by Resend HTTP API
 * Uses HTTPS port 443 so no firewall issues on any host.
 * Set RESEND_API_KEY (or SMTP_PASS as fallback) in your env vars.
 */
const https = require('https');

const FROM     = process.env.FROM_EMAIL  || 'bookings@probookhq.com';
const BRAND    = process.env.BRAND_NAME  || 'ProBook';
const APP_URL  = process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app';

// ── Core send function ────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;

  if (!apiKey) {
    console.log(`[EMAIL SKIPPED] No API key set. Would send to ${to}: "${subject}"`);
    return;
  }

  const body = JSON.stringify({
    from: `${BRAND} <${FROM}>`,
    to:   [to],
    subject,
    html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path:     '/emails',
        method:   'POST',
        headers:  {
          Authorization:   `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`📧 Email sent → ${to} | "${subject}"`);
            resolve(JSON.parse(data));
          } else {
            const err = new Error(`Resend ${res.statusCode}: ${data}`);
            console.error(`📧 Email failed → ${to}:`, err.message);
            reject(err);
          }
        });
      }
    );
    req.on('error', (err) => {
      console.error(`📧 Email network error → ${to}:`, err.message);
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

// ── Email templates ───────────────────────────────────────────────────────────

async function sendBookingLink(lead, contractor, bookingUrl) {
  return sendEmail(
    lead.email,
    `Your appointment is ready to schedule — ${BRAND}`,
    `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e;">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">${BRAND}</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <h2 style="color:#1a1a2e;margin-top:0;">Hi ${lead.name}!</h2>
        <p>Great news — we matched you with <strong>${contractor.company_name || contractor.name}</strong>.</p>
        <p>Click below to pick a time that works for you:</p>
        <a href="${bookingUrl}"
           style="display:inline-block;background:#6366f1;color:white;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;margin:16px 0;">
          Pick Your Appointment Time →
        </a>
        <p style="color:#6b7280;font-size:14px;">This link expires in 24 hours.</p>
      </div>
    </div>
    `
  );
}

async function notifyContractor(contractor, lead) {
  return sendEmail(
    contractor.email,
    `New lead: ${lead.name} in ${lead.zip_code}`,
    `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">${BRAND}</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <h2 style="margin-top:0;">New Lead Assigned 🎉</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#6b7280;width:100px;">Name</td>
              <td style="padding:8px 0;font-weight:600;">${lead.name}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Zip</td>
              <td style="padding:8px 0;font-weight:600;">${lead.zip_code}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Project</td>
              <td style="padding:8px 0;">${lead.description || 'No description provided'}</td></tr>
        </table>
        <p style="color:#6b7280;margin-top:24px;">
          The homeowner has been sent a booking link. You'll get a confirmation once they pick a time.
        </p>
        <a href="${APP_URL}/contractor"
           style="display:inline-block;background:#6366f1;color:white;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;">
          View Your Dashboard →
        </a>
      </div>
    </div>
    `
  );
}

async function sendAppointmentConfirmation(lead, contractor, appointment) {
  const dateStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const makeHtml = (recipientName, otherPartyName) => `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#10b981,#059669);padding:32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;">Appointment Confirmed ✓</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>Hi ${recipientName},</p>
        <p>Your appointment with <strong>${otherPartyName}</strong> is confirmed.</p>
        <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:16px;border-radius:4px;margin:20px 0;">
          <strong>📅 ${dateStr}</strong><br>
          <strong>🕐 ${appointment.scheduled_time}</strong>
        </div>
        <p style="color:#6b7280;font-size:14px;">
          If you need to reschedule, please contact us by replying to this email.
        </p>
      </div>
    </div>
  `;

  await Promise.allSettled([
    sendEmail(
      lead.email,
      `Appointment Confirmed: ${dateStr}`,
      makeHtml(lead.name, contractor.company_name || contractor.name)
    ),
    sendEmail(
      contractor.email,
      `Appointment Confirmed: ${dateStr} — ${lead.name}`,
      makeHtml(contractor.name, lead.name)
    ),
  ]);
}

module.exports = { sendBookingLink, notifyContractor, sendAppointmentConfirmation };
