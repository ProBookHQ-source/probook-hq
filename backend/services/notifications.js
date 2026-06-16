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

// Inline bolt SVG (36×36 for header use)
const BOLT_SVG_LG = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
  <rect width="36" height="36" rx="9" fill="#6366f1"/>
  <polygon points="13.5,4.5 23.5,4.5 19,17.5 25.5,17.5 16.5,31.5 14,21 8.5,21" fill="white"/>
</svg>`;

// Master wrapper — centered logo header, colored band, body, signature, dark footer
function emailBase({ bandBg = '#6366f1', bandLabel, bandHeadline, bandSub = '', bodyContent, showSig = true }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f0f5;padding:36px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:580px;">

  <!-- Top logo header -->
  <tr><td style="background:#0f0e17;border-radius:14px 14px 0 0;padding:24px 40px;text-align:center;">
    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
      <tr>
        <td style="padding-right:12px;vertical-align:middle;">${BOLT_SVG_LG}</td>
        <td style="vertical-align:middle;line-height:1;">
          <span style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Pro</span><span style="font-size:26px;font-weight:300;color:#a5a8f0;letter-spacing:-0.5px;">Book</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Colored band -->
  <tr><td style="background:${bandBg};padding:32px 40px 28px;text-align:center;">
    ${bandLabel ? `<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.7);">${bandLabel}</p>` : ''}
    <h1 style="margin:0 0 ${bandSub ? '8px' : '0'};font-size:28px;font-weight:800;color:#ffffff;line-height:1.2;">${bandHeadline}</h1>
    ${bandSub ? `<p style="margin:0;font-size:15px;color:rgba(255,255,255,0.8);">${bandSub}</p>` : ''}
  </td></tr>

  <!-- White body -->
  <tr><td style="background:#ffffff;padding:36px 40px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      ${bodyContent}
    </table>
  </td></tr>

  ${showSig ? `
  <!-- Signature -->
  <tr><td style="background:#f7f7fb;border-top:1px solid #e8e8f0;padding:24px 40px;">
    <table role="presentation" cellspacing="0" cellpadding="0">
      <tr>
        <td style="padding-right:14px;vertical-align:middle;">
          <div style="width:44px;height:44px;background:#6366f1;border-radius:10px;display:flex;align-items:center;justify-content:center;">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="44" height="44" rx="10" fill="#6366f1"/>
              <polygon points="16.5,5.5 28.5,5.5 23,21.5 31.5,21.5 20.5,38.5 17.5,25.5 10,25.5" fill="white"/>
            </svg>
          </div>
        </td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a2e;">The <span style="color:#6366f1;">ProBook</span> Team</p>
          <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">bookings@probookhq.com</p>
          <p style="margin:2px 0 0;font-size:13px;color:#6b7280;">Auto-Booking Platform</p>
        </td>
      </tr>
    </table>
  </td></tr>` : ''}

  <!-- Dark footer -->
  <tr><td style="background:#0f0e17;border-radius:0 0 14px 14px;padding:20px 40px;text-align:center;">
    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#a5a8f0;">probookhq.com</p>
    <p style="margin:0;font-size:12px;color:#4a4a6a;">You received this because you have an active request with ProBook. Questions? Reply to this email.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// Numbered step card
function stepCard(num, title, desc, color = '#6366f1') {
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:12px;">
    <tr>
      <td style="width:40px;vertical-align:top;padding-top:2px;">
        <div style="width:32px;height:32px;background:${color};border-radius:50%;text-align:center;line-height:32px;font-size:14px;font-weight:700;color:#fff;">${num}</div>
      </td>
      <td style="padding-left:14px;vertical-align:top;">
        <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:#1a1a2e;">${title}</p>
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5;">${desc}</p>
      </td>
    </tr>
  </table>`;
}

// Appointment detail card
function apptCard(dateStr, timeStr, extraLine = '') {
  return `
  <tr><td style="padding:4px 0 24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
           style="background:#f5f3ff;border-radius:10px;border-left:4px solid #6366f1;">
      <tr><td style="padding:18px 22px;">
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1a1a2e;">&#128197;&nbsp; ${dateStr}</p>
        <p style="margin:0 0 ${extraLine ? '6px' : '0'};font-size:16px;font-weight:700;color:#1a1a2e;">&#128336;&nbsp; ${timeStr}</p>
        ${extraLine ? `<p style="margin:0;font-size:16px;font-weight:700;color:#1a1a2e;">${extraLine}</p>` : ''}
      </td></tr>
    </table>
  </td></tr>`;
}

// Callout / info box
function calloutBox(text, bg = '#fef3c7', border = '#f59e0b', textColor = '#92400e') {
  return `
  <tr><td style="padding:4px 0 24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
           style="background:${bg};border-radius:10px;border-left:4px solid ${border};">
      <tr><td style="padding:16px 20px;font-size:14px;color:${textColor};line-height:1.6;">${text}</td></tr>
    </table>
  </td></tr>`;
}

// Full-width CTA button
function ctaBtn(href, label, bg = '#6366f1') {
  return `
  <tr><td style="padding:8px 0 20px;text-align:center;">
    <a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;
       padding:16px 40px;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:0.2px;">
      ${label} &rarr;
    </a>
  </td></tr>`;
}

// Lead info table row
function infoRow(label, value, bold = false) {
  return `
  <tr style="border-bottom:1px solid #f3f3f7;">
    <td style="padding:11px 0;color:#6b7280;font-size:14px;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:11px 0;font-size:14px;${bold ? 'font-weight:700;' : ''}color:#1a1a2e;">${value}</td>
  </tr>`;
}

// Section divider with label
function sectionLabel(text) {
  return `
  <tr><td style="padding:24px 0 12px;">
    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;">${text}</p>
  </td></tr>`;
}

// ── Email templates ───────────────────────────────────────────────────────────

async function sendBookingLink(lead, contractor, bookingUrl) {
  const contractorName = esc(contractor.company_name || contractor.name);
  const html = emailBase({
    bandBg: '#6366f1',
    bandLabel: 'YOUR CONTRACTOR MATCH',
    bandHeadline: `You've been matched!`,
    bandSub: `${contractorName} is ready to schedule your appointment.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(lead.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          We found a qualified contractor for your project. Click below to pick an appointment time that works for you — it only takes a few seconds.
        </p>
      </td></tr>

      ${ctaBtn(bookingUrl, 'Pick Your Appointment Time')}

      ${sectionLabel("Here's What Happens Next")}
      <tr><td style="padding:0 0 8px;">
        ${stepCard(1, 'Pick your time', 'Choose any available slot from the calendar — no phone calls needed.')}
        ${stepCard(2, 'Get a confirmation', 'You\'ll receive an email confirmation with your appointment details.')}
        ${stepCard(3, 'Your contractor arrives', `${contractorName} will show up ready to help with your project.`)}
      </td></tr>

      ${calloutBox('<strong>Important:</strong> This booking link expires in 48 hours. If you don\'t see the email next time, check your spam or junk folder.')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Questions? Just reply to this email and we'll get back to you promptly.</p>
      </td></tr>`,
  });
  return sendEmail(lead.email, `You've been matched with ${esc(contractor.company_name || contractor.name)} — book your time | ${BRAND}`, html);
}

async function notifyContractor(contractor, lead) {
  let metaRows = '';
  try {
    const meta = lead.metadata
      ? (typeof lead.metadata === 'string' ? JSON.parse(lead.metadata) : lead.metadata)
      : {};
    const labelMap = {
      heating: 'Heating System', oil_tank: 'Oil Tank', ductwork: 'Ductwork',
      year_built: 'Year Built', square_footage: 'Square Footage', monthly_oil_bill: 'Monthly Oil Bill',
      reason: 'Reason for Switch', timeline: 'Timeline', homeowner: 'Homeowner Status',
      household_size: 'Household Size', income: 'Income Bracket', address: 'Address',
    };
    const tierRow   = lead.external_tier ? infoRow('Lead Tier', `<span style="color:#059669;font-weight:700;">${esc(lead.external_tier)} (score: ${lead.external_score || '?'})</span>`) : '';
    const sourceRow = lead.source_site ? infoRow('Source', esc(lead.source_site)) : '';
    const qualRows  = Object.entries(labelMap).filter(([k]) => meta[k]).map(([k, label]) => infoRow(label, esc(String(meta[k])))).join('');
    if (tierRow || sourceRow || qualRows) {
      metaRows = `${sectionLabel('Qualifying Details')}<tr><td>${tierRow}${sourceRow}${qualRows}</td></tr>`;
    }
  } catch (e) { /* non-fatal */ }

  const html = emailBase({
    bandBg: '#6366f1',
    bandLabel: 'NEW LEAD ASSIGNED',
    bandHeadline: esc(lead.name),
    bandSub: `${esc(lead.zip_code)} &mdash; ready to book`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(contractor.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          A new homeowner has been matched to you. We've sent them a booking link — you'll receive a confirmation email the moment they schedule their appointment.
        </p>
      </td></tr>

      ${sectionLabel('Lead Details')}
      <tr><td>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${infoRow('Name',    esc(lead.name),    true)}
          ${infoRow('Phone',   esc(lead.phone) || '<span style="color:#9ca3af;">Not provided</span>')}
          ${infoRow('Email',   esc(lead.email))}
          ${infoRow('Zip',     esc(lead.zip_code), true)}
          ${lead.description ? infoRow('Project', esc(lead.description)) : ''}
        </table>
      </td></tr>
      ${metaRows}

      ${ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">You'll receive another email once the homeowner picks their appointment time.</p>
      </td></tr>`,
  });
  return sendEmail(contractor.email, `New lead assigned: ${lead.name} in ${lead.zip_code} | ${BRAND}`, html);
}

async function sendAppointmentConfirmation(lead, contractor, appointment) {
  const dateStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const makeHtml = (recipientName, otherPartyName, isContractor = false) => emailBase({
    bandBg: '#059669',
    bandLabel: 'APPOINTMENT CONFIRMED',
    bandHeadline: `You're all set!`,
    bandSub: `Your appointment with ${esc(otherPartyName)} is confirmed.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(recipientName)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Your appointment has been confirmed. Here are your details:
        </p>
      </td></tr>

      ${apptCard(dateStr, fmtTime(appointment.scheduled_time))}

      ${sectionLabel("What Happens Next")}
      <tr><td style="padding:0 0 20px;">
        ${stepCard(1, 'Save the date', 'Add this appointment to your calendar so you don\'t forget.', '#059669')}
        ${isContractor
          ? stepCard(2, 'Prepare for the visit', 'Review the project details and arrive ready to help.', '#059669')
          : stepCard(2, 'Be ready for your contractor', `${esc(otherPartyName)} will arrive at the scheduled time.`, '#059669')}
        ${stepCard(3, 'Get it done', 'Your appointment is confirmed — no further action needed.', '#059669')}
      </td></tr>

      ${isContractor ? ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard', '#059669') : ''}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Need to reschedule? Reply to this email and we'll get it sorted out right away.</p>
      </td></tr>`,
  });

  await Promise.allSettled([
    sendEmail(lead.email,       `Appointment confirmed: ${dateStr} | ${BRAND}`,                makeHtml(lead.name, contractor.company_name || contractor.name, false)),
    sendEmail(contractor.email, `Appointment confirmed: ${dateStr} — ${lead.name} | ${BRAND}`, makeHtml(contractor.name, lead.name, true)),
  ]);
}

async function sendCancellationAndRebook(lead, contractor, newBookingUrl) {
  const html = emailBase({
    bandBg: '#dc2626',
    bandLabel: 'APPOINTMENT UPDATE',
    bandHeadline: `Your appointment was cancelled`,
    bandSub: `No worries — we'll get you rebooked right away.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(lead.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Unfortunately, <strong>${esc(contractor.company_name || contractor.name)}</strong> had to cancel your appointment. We've already issued you a new booking link so you can pick a new time at no extra hassle.
        </p>
      </td></tr>

      ${ctaBtn(newBookingUrl, 'Pick a New Time', '#dc2626')}

      ${calloutBox('<strong>Your new booking link is active and ready.</strong> Simply click the button above to choose a new appointment time. This link expires in 48 hours.')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">We sincerely apologize for the inconvenience. If you have any questions, just reply to this email.</p>
      </td></tr>`,
  });
  return sendEmail(lead.email, `Your appointment was cancelled — rebook now | ${BRAND}`, html);
}

// Notify admin when no contractor could be matched to a new lead
async function sendAdminNoMatch(lead) {
  const html = emailBase({
    bandBg: '#d97706',
    bandLabel: 'ACTION REQUIRED',
    bandHeadline: `Unmatched Lead`,
    bandSub: `No contractor available for ${esc(lead.zip_code)}.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          A new lead came in but <strong>no contractor was available</strong> for their service type and zip code. This lead needs to be manually assigned from the admin dashboard.
        </p>
      </td></tr>

      ${sectionLabel('Lead Details')}
      <tr><td style="padding:0 0 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${infoRow('Name',    esc(lead.name),                              true)}
          ${infoRow('Email',   esc(lead.email))}
          ${infoRow('Zip',     esc(lead.zip_code),                          true)}
          ${infoRow('Project', esc(lead.description) || 'No description')}
        </table>
      </td></tr>

      ${calloutBox('<strong>Heads up:</strong> This homeowner is waiting. Assign a contractor and send them a booking link as soon as possible to avoid losing the lead.', '#fef3c7', '#f59e0b', '#92400e')}

      ${ctaBtn(`${APP_URL}/admin`, 'Open Admin Dashboard', '#d97706')}`,
  });
  return sendEmail(ADMIN_EMAIL, `[Action Required] Unmatched lead — ${lead.name} in ${lead.zip_code} | ${BRAND}`, html);
}

async function sendAppointmentReminder(appt) {
  const dateStr = new Date(appt.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const homeownerHtml = emailBase({
    bandBg: '#6366f1',
    bandLabel: 'APPOINTMENT REMINDER',
    bandHeadline: `Your appointment is tomorrow`,
    bandSub: `Just a heads-up so you're ready.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(appt.lead_name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          This is a reminder that your appointment with <strong>${esc(appt.company_name || appt.contractor_name)}</strong> is scheduled for tomorrow.
        </p>
      </td></tr>

      ${apptCard(dateStr, fmtTime(appt.scheduled_time))}

      ${calloutBox('If anything comes up and you need to reschedule, please reply to this email as soon as possible so we can find you a new time.')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">We look forward to helping you with your project. See you tomorrow!</p>
      </td></tr>`,
  });

  const contractorHtml = emailBase({
    bandBg: '#6366f1',
    bandLabel: 'APPOINTMENT REMINDER',
    bandHeadline: `You have an appointment tomorrow`,
    bandSub: `${esc(appt.lead_name)} &mdash; ${dateStr}`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(appt.contractor_name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          This is a reminder that you have a scheduled appointment with <strong>${esc(appt.lead_name)}</strong> tomorrow.
        </p>
      </td></tr>

      ${apptCard(dateStr, fmtTime(appt.scheduled_time), appt.lead_phone ? `&#128222;&nbsp; ${esc(appt.lead_phone)}` : '')}

      ${ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">If you need to cancel or reschedule, reply to this email immediately so the homeowner can be notified.</p>
      </td></tr>`,
  });

  await Promise.allSettled([
    sendEmail(appt.lead_email,       `Reminder: your appointment is tomorrow | ${BRAND}`,            homeownerHtml),
    sendEmail(appt.contractor_email, `Reminder: appointment tomorrow — ${appt.lead_name} | ${BRAND}`, contractorHtml),
  ]);
}

module.exports = { sendBookingLink, notifyContractor, sendAppointmentConfirmation, sendCancellationAndRebook, sendAdminNoMatch, sendAppointmentReminder };
