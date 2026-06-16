/**
 * Notifications — powered by Resend HTTP API
 * Uses HTTPS port 443 so no firewall issues on any host.
 * Set RESEND_API_KEY (or SMTP_PASS as fallback) in your env vars.
 */
const https = require('https');

const FROM      = process.env.FROM_EMAIL  || 'bookings@probookhq.com';

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
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

// ── Shared email components ───────────────────────────────────────────────────

// Inline SVG bolt icon that renders reliably in all email clients
const LOGO_SVG = `
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle;">
    <rect width="28" height="28" rx="7" fill="#6366f1"/>
    <polygon points="10.5,3.5 18.5,3.5 15,13.5 20,13.5 13,24.5 11,16.5 6.5,16.5" fill="white"/>
  </svg>`;

// Master email wrapper — consistent header, body, footer
function emailBase({ headerBg = '#6366f1', headerContent, bodyContent, accentColor = '#6366f1' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${BRAND}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Logo bar -->
        <tr>
          <td style="background:#0f0e17;padding:20px 32px;">
            <table role="presentation" cellspacing="0" cellpadding="0">
              <tr>
                <td style="padding-right:10px;">${LOGO_SVG}</td>
                <td style="vertical-align:middle;">
                  <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Pro</span><span style="font-size:20px;font-weight:400;color:#c7c8e8;letter-spacing:-0.3px;">Book</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Colored header band -->
        <tr>
          <td style="background:${headerBg};padding:28px 32px;">
            ${headerContent}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${bodyContent}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9fc;border-top:1px solid #e8e8f0;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you have an active appointment request with <strong style="color:#6b7280;">${BRAND}</strong>.</p>
            <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">probookhq.com</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Reusable date/time highlight card
function apptCard(dateStr, timeStr, extraLine = '') {
  return `
  <tr><td style="padding:4px 0 20px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
           style="background:#f5f3ff;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a2e;">&#128197; ${dateStr}</p>
        <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a2e;">&#128336; ${timeStr}</p>
        ${extraLine ? `<p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1a1a2e;">${extraLine}</p>` : ''}
      </td></tr>
    </table>
  </td></tr>`;
}

// Reusable CTA button row
function ctaBtn(href, label, bg = '#6366f1') {
  return `
  <tr><td style="padding:8px 0 4px;">
    <a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;
       padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.1px;">
      ${label} &rarr;
    </a>
  </td></tr>`;
}

// Reusable info table row
function infoRow(label, value, bold = false) {
  return `
  <tr>
    <td style="padding:9px 0;color:#6b7280;font-size:14px;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:9px 0;font-size:14px;${bold ? 'font-weight:600;' : ''}color:#1a1a2e;">${value}</td>
  </tr>`;
}

// ── Email templates ───────────────────────────────────────────────────────────

async function sendBookingLink(lead, contractor, bookingUrl) {
  const html = emailBase({
    headerBg: '#6366f1',
    headerContent: `
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">You've been matched!</h1>
      <p style="margin:0;font-size:15px;color:#c7c8f8;">Pick a time that works for you.</p>`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">Hi <strong>${esc(lead.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">
          We matched you with <strong>${esc(contractor.company_name || contractor.name)}</strong>.
          Click below to choose your appointment time — it only takes a few seconds.
        </p>
      </td></tr>
      ${ctaBtn(bookingUrl, 'Pick Your Appointment Time')}
      <tr><td style="padding:20px 0 0;">
        <p style="margin:0;font-size:13px;color:#9ca3af;">This link expires in 48 hours. Don't see this email next time? Check your spam or junk folder.</p>
      </td></tr>`,
  });
  return sendEmail(lead.email, `You've been matched — pick your time | ${BRAND}`, html);
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
    const tierRow = lead.external_tier
      ? infoRow('Lead Tier', `<span style="color:#059669;font-weight:700;">${esc(lead.external_tier)} (score: ${lead.external_score || '?'})</span>`)
      : '';
    const sourceRow = lead.source_site ? infoRow('Source', esc(lead.source_site)) : '';
    const qualRows = Object.entries(labelMap)
      .filter(([k]) => meta[k])
      .map(([k, label]) => infoRow(label, esc(String(meta[k]))))
      .join('');

    if (tierRow || sourceRow || qualRows) {
      metaRows = `
        <tr><td colspan="2" style="padding:20px 0 8px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;">Qualifying Details</p>
        </td></tr>
        ${tierRow}${sourceRow}${qualRows}`;
    }
  } catch (e) { /* non-fatal */ }

  const html = emailBase({
    headerBg: '#6366f1',
    headerContent: `
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">New lead assigned</h1>
      <p style="margin:0;font-size:15px;color:#c7c8f8;">${esc(lead.name)} &mdash; ${esc(lead.zip_code)}</p>`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">
          A new homeowner has been matched to you. Their booking link is on its way — you'll get a confirmation email once they pick a time.
        </p>
      </td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="border:1px solid #e8e8f0;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${infoRow('Name',  esc(lead.name),     true)}
              ${infoRow('Phone', esc(lead.phone) || '<span style="color:#9ca3af;">Not provided</span>')}
              ${infoRow('Email', esc(lead.email))}
              ${infoRow('Zip',   esc(lead.zip_code), true)}
              ${esc(lead.description) ? infoRow('Project', esc(lead.description)) : ''}
              ${metaRows}
            </table>
          </td></tr>
        </table>
      </td></tr>
      ${ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard')}`,
  });
  return sendEmail(contractor.email, `New lead: ${lead.name} in ${lead.zip_code} | ${BRAND}`, html);
}

async function sendAppointmentConfirmation(lead, contractor, appointment) {
  const dateStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const makeHtml = (recipientName, otherPartyName, isContractor = false) => emailBase({
    headerBg: '#059669',
    headerContent: `
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Appointment confirmed</h1>
      <p style="margin:0;font-size:15px;color:#a7f3d0;">You're all set.</p>`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">Hi <strong>${esc(recipientName)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#374151;">
          Your appointment with <strong>${esc(otherPartyName)}</strong> is confirmed.
        </p>
      </td></tr>
      ${apptCard(dateStr, fmtTime(appointment.scheduled_time))}
      ${isContractor ? ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard', '#059669') : ''}
      <tr><td style="padding:${isContractor ? '16px' : '4px'} 0 0;">
        <p style="margin:0;font-size:13px;color:#9ca3af;">Need to reschedule? Reply to this email and we'll get it sorted.</p>
      </td></tr>`,
    accentColor: '#059669',
  });

  await Promise.allSettled([
    sendEmail(lead.email,       `Appointment confirmed: ${dateStr} | ${BRAND}`,              makeHtml(lead.name, contractor.company_name || contractor.name, false)),
    sendEmail(contractor.email, `Appointment confirmed: ${dateStr} — ${lead.name} | ${BRAND}`, makeHtml(contractor.name, lead.name, true)),
  ]);
}

async function sendCancellationAndRebook(lead, contractor, newBookingUrl) {
  const html = emailBase({
    headerBg: '#dc2626',
    headerContent: `
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Appointment cancelled</h1>
      <p style="margin:0;font-size:15px;color:#fecaca;">We'll get you rebooked right away.</p>`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">Hi <strong>${esc(lead.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">
          Unfortunately, <strong>${esc(contractor.company_name || contractor.name)}</strong> had to cancel your appointment.
          We've already issued you a new booking link so you can pick a new time.
        </p>
      </td></tr>
      ${ctaBtn(newBookingUrl, 'Pick a New Time')}
      <tr><td style="padding:20px 0 0;">
        <p style="margin:0;font-size:13px;color:#9ca3af;">This link expires in 48 hours. We apologize for the inconvenience.</p>
      </td></tr>`,
  });
  return sendEmail(lead.email, `Your appointment was cancelled — rebook now | ${BRAND}`, html);
}

// Notify admin when no contractor could be matched to a new lead
async function sendAdminNoMatch(lead) {
  const html = emailBase({
    headerBg: '#d97706',
    headerContent: `
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Unmatched lead — action required</h1>
      <p style="margin:0;font-size:15px;color:#fde68a;">No contractor available for this zip &amp; niche.</p>`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">
          A new lead came in but <strong>no contractor was available</strong> for their service and zip code. Manual assignment needed.
        </p>
      </td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="border:1px solid #e8e8f0;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${infoRow('Name',    esc(lead.name),                              true)}
              ${infoRow('Email',   esc(lead.email))}
              ${infoRow('Zip',     esc(lead.zip_code),                          true)}
              ${infoRow('Project', esc(lead.description) || 'No description')}
            </table>
          </td></tr>
        </table>
      </td></tr>
      ${ctaBtn(`${APP_URL}/admin`, 'Open Admin Dashboard', '#d97706')}`,
  });
  return sendEmail(ADMIN_EMAIL, `[Action Required] No match for ${lead.name} — ${lead.zip_code} | ${BRAND}`, html);
}

async function sendAppointmentReminder(appt) {
  const dateStr = new Date(appt.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const homeownerHtml = emailBase({
    headerBg: '#6366f1',
    headerContent: `
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Reminder: appointment tomorrow</h1>
      <p style="margin:0;font-size:15px;color:#c7c8f8;">Just a heads-up so you're ready.</p>`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">Hi <strong>${esc(appt.lead_name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#374151;">
          Your appointment with <strong>${esc(appt.company_name || appt.contractor_name)}</strong> is tomorrow.
        </p>
      </td></tr>
      ${apptCard(dateStr, fmtTime(appt.scheduled_time))}
      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">If anything comes up, please contact your contractor as soon as possible.</p>
      </td></tr>`,
  });

  const contractorHtml = emailBase({
    headerBg: '#6366f1',
    headerContent: `
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Reminder: appointment tomorrow</h1>
      <p style="margin:0;font-size:15px;color:#c7c8f8;">${esc(appt.lead_name)} &mdash; ${dateStr}</p>`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#374151;">Hi <strong>${esc(appt.contractor_name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#374151;">
          You have an appointment tomorrow with <strong>${esc(appt.lead_name)}</strong>.
        </p>
      </td></tr>
      ${apptCard(dateStr, fmtTime(appt.scheduled_time), appt.lead_phone ? `&#128222; ${esc(appt.lead_phone)}` : '')}
      ${ctaBtn(`${APP_URL}/contractor`, 'Open Your Dashboard')}`,
  });

  await Promise.allSettled([
    sendEmail(appt.lead_email,       `Reminder: your appointment is tomorrow | ${BRAND}`,       homeownerHtml),
    sendEmail(appt.contractor_email, `Reminder: appointment tomorrow — ${appt.lead_name} | ${BRAND}`, contractorHtml),
  ]);
}

module.exports = { sendBookingLink, notifyContractor, sendAppointmentConfirmation, sendCancellationAndRebook, sendAdminNoMatch, sendAppointmentReminder };
