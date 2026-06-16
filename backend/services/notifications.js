/**
 * Notifications — powered by Resend HTTP API
 * Uses HTTPS port 443 so no firewall issues on any host.
 * Set RESEND_API_KEY (or SMTP_PASS as fallback) in your env vars.
 */
const https = require('https');

const FROM      = process.env.FROM_EMAIL  || 'bookings@probookhq.com';
const BRAND     = process.env.BRAND_NAME  || 'ProBook';
const APP_URL   = process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.FROM_EMAIL || 'bookings@probookhq.com';

// Prevent XSS in email HTML — escape user-supplied strings before inserting into templates
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
        <h2 style="color:#1a1a2e;margin-top:0;">Hi ${esc(lead.name)}!</h2>
        <p>Great news — we matched you with <strong>${esc(contractor.company_name || contractor.name)}</strong>.</p>
        <p>Click below to pick a time that works for you:</p>
        <a href="${bookingUrl}"
           style="display:inline-block;background:#6366f1;color:white;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;margin:16px 0;">
          Pick Your Appointment Time →
        </a>
        <p style="color:#6b7280;font-size:14px;">This link expires in 48 hours.</p>
      </div>
    </div>
    `
  );
}

async function notifyContractor(contractor, lead) {
  // Build qualifying details rows from metadata (if present)
  let metaRows = '';
  try {
    const meta = lead.metadata
      ? (typeof lead.metadata === 'string' ? JSON.parse(lead.metadata) : lead.metadata)
      : {};
    const labelMap = {
      heating:          'Heating System',
      oil_tank:         'Oil Tank',
      ductwork:         'Ductwork',
      year_built:       'Year Built',
      square_footage:   'Square Footage',
      monthly_oil_bill: 'Monthly Oil Bill',
      reason:           'Reason for Switch',
      timeline:         'Timeline',
      homeowner:        'Homeowner Status',
      household_size:   'Household Size',
      income:           'Income Bracket',
      address:          'Address',
    };
    const tierBadge = lead.external_tier
      ? `<tr><td style="padding:8px 0;color:#6b7280;width:130px;">Lead Tier</td>
             <td style="padding:8px 0;font-weight:700;color:#059669;">${esc(lead.external_tier)} (score: ${lead.external_score || '?'})</td></tr>`
      : '';
    const sourceBadge = lead.source_site
      ? `<tr><td style="padding:8px 0;color:#6b7280;">Source</td>
             <td style="padding:8px 0;">${esc(lead.source_site)}</td></tr>`
      : '';
    const qualifying = Object.entries(labelMap)
      .filter(([k]) => meta[k])
      .map(([k, label]) =>
        `<tr><td style="padding:6px 0;color:#6b7280;">${label}</td>
             <td style="padding:6px 0;">${esc(String(meta[k]))}</td></tr>`
      ).join('');
    if (tierBadge || sourceBadge || qualifying) {
      metaRows = `
        <tr><td colspan="2" style="padding:16px 0 4px;font-weight:700;color:#1a1a2e;font-size:13px;text-transform:uppercase;letter-spacing:.5px;">Qualifying Details</td></tr>
        ${tierBadge}${sourceBadge}${qualifying}
      `;
    }
  } catch (e) { /* non-fatal */ }

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
          <tr><td style="padding:8px 0;color:#6b7280;width:130px;">Name</td>
              <td style="padding:8px 0;font-weight:600;">${esc(lead.name)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Phone</td>
              <td style="padding:8px 0;font-weight:600;">${esc(lead.phone) || 'Not provided'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Email</td>
              <td style="padding:8px 0;">${esc(lead.email)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Zip</td>
              <td style="padding:8px 0;font-weight:600;">${esc(lead.zip_code)}</td></tr>
          ${metaRows}
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
        <p>Hi ${esc(recipientName)},</p>
        <p>Your appointment with <strong>${esc(otherPartyName)}</strong> is confirmed.</p>
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

async function sendCancellationAndRebook(lead, contractor, newBookingUrl) {
  return sendEmail(
    lead.email,
    `Your appointment was cancelled — rebook now`,
    `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e;">
      <div style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">${BRAND}</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <h2 style="color:#1a1a2e;margin-top:0;">Hi ${esc(lead.name)},</h2>
        <p>Unfortunately, <strong>${esc(contractor.company_name || contractor.name)}</strong> had to cancel your appointment.</p>
        <p>No worries — we've issued you a new booking link so you can pick a new time:</p>
        <a href="${newBookingUrl}"
           style="display:inline-block;background:#6366f1;color:white;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;margin:16px 0;">
          Pick a New Time →
        </a>
        <p style="color:#6b7280;font-size:14px;">This link expires in 48 hours.</p>
      </div>
    </div>
    `
  );
}

// Notify admin when no contractor could be matched to a new lead
async function sendAdminNoMatch(lead) {
  return sendEmail(
    ADMIN_EMAIL,
    `[Action Required] No contractor matched for ${lead.name} — ${lead.zip_code}`,
    `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:22px;">⚠️ Unmatched Lead</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>A new lead came in but <strong>no contractor was available</strong> for their niche and zip code.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 0;color:#6b7280;width:100px;">Name</td>
              <td style="padding:8px 0;font-weight:600;">${esc(lead.name)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Email</td>
              <td style="padding:8px 0;">${esc(lead.email)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Zip</td>
              <td style="padding:8px 0;font-weight:600;">${esc(lead.zip_code)}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;">Project</td>
              <td style="padding:8px 0;">${esc(lead.description) || 'No description'}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:14px;">Log in to the admin dashboard to manually assign a contractor.</p>
        <a href="${APP_URL}/admin"
           style="display:inline-block;background:#6366f1;color:white;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;">
          Open Admin Dashboard →
        </a>
      </div>
    </div>
    `
  );
}

async function sendAppointmentReminder(appt) {
  const dateStr = new Date(appt.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const homeownerHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">⏰ Appointment Tomorrow</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>Hi ${esc(appt.lead_name)},</p>
        <p>Just a reminder — your appointment with <strong>${esc(appt.company_name || appt.contractor_name)}</strong> is tomorrow.</p>
        <div style="background:#f5f3ff;border-left:4px solid #6366f1;padding:16px;border-radius:4px;margin:20px 0;">
          <strong>📅 ${dateStr}</strong><br>
          <strong>🕐 ${appt.scheduled_time}</strong>
        </div>
        <p style="color:#6b7280;font-size:14px;">If anything comes up, please contact your contractor as soon as possible.</p>
      </div>
    </div>
  `;

  const contractorHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">⏰ Appointment Tomorrow</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>Hi ${esc(appt.contractor_name)},</p>
        <p>Reminder — you have an appointment tomorrow with <strong>${esc(appt.lead_name)}</strong>.</p>
        <div style="background:#f5f3ff;border-left:4px solid #6366f1;padding:16px;border-radius:4px;margin:20px 0;">
          <strong>📅 ${dateStr}</strong><br>
          <strong>🕐 ${appt.scheduled_time}</strong><br>
          ${appt.lead_phone ? `<strong>📞 ${esc(appt.lead_phone)}</strong>` : ''}
        </div>
        <a href="${APP_URL}/contractor"
           style="display:inline-block;background:#6366f1;color:white;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;">
          Open Your Dashboard →
        </a>
      </div>
    </div>
  `;

  await Promise.allSettled([
    sendEmail(appt.lead_email, `Reminder: Your appointment is tomorrow — ${BRAND}`, homeownerHtml),
    sendEmail(appt.contractor_email, `Reminder: Appointment tomorrow — ${appt.lead_name}`, contractorHtml),
  ]);
}

module.exports = { sendBookingLink, notifyContractor, sendAppointmentConfirmation, sendCancellationAndRebook, sendAdminNoMatch, sendAppointmentReminder };
