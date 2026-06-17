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

// Clean white master wrapper — indigo accents only, no dark backgrounds
function emailBase({ accentColor = '#6366f1', label, headline, sub = '', bodyContent }) {
  // Hosted PNG — works in Gmail, iCloud, Outlook, everywhere (SVG is stripped by Gmail)
  const iconImg = `<img src="${APP_URL}/probook-icon-128.png" width="36" height="36" alt="ProBook" style="display:block;border-radius:8px;" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f8;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);">

  <!-- Logo row — white bg, centered -->
  <tr><td style="padding:28px 40px 0;text-align:center;border-bottom:none;">
    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
      <tr>
        <td style="padding-right:10px;vertical-align:middle;">${iconImg}</td>
        <td style="vertical-align:middle;line-height:1;">
          <span style="font-size:24px;font-weight:800;color:${accentColor};letter-spacing:-0.5px;">Pro</span><span style="font-size:24px;font-weight:400;color:#1a1a2e;letter-spacing:-0.5px;">Book</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Thin accent divider -->
  <tr><td style="padding:20px 40px 0;">
    <div style="height:3px;background:${accentColor};border-radius:2px;"></div>
  </td></tr>

  <!-- Headline section — white with colored text -->
  <tr><td style="padding:28px 40px 0;text-align:center;">
    ${label ? `<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${accentColor};">${label}</p>` : ''}
    <h1 style="margin:0 0 ${sub ? '10px' : '0'};font-size:26px;font-weight:800;color:#1a1a2e;line-height:1.25;">${headline}</h1>
    ${sub ? `<p style="margin:0;font-size:15px;color:#6b7280;">${sub}</p>` : ''}
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 40px 8px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      ${bodyContent}
    </table>
  </td></tr>

  <!-- Signature -->
  <tr><td style="padding:4px 40px 28px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #f0f0f5;padding-top:20px;margin-top:8px;">
      <tr>
        <td style="padding-right:12px;vertical-align:middle;width:44px;">
          <img src="${APP_URL}/probook-icon-128.png" width="44" height="44" alt="ProBook" style="display:block;border-radius:10px;" />
        </td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a2e;">The <span style="color:${accentColor};">ProBook</span> Team</p>
          <p style="margin:2px 0 0;font-size:13px;color:#9ca3af;">bookings@probookhq.com &nbsp;·&nbsp; probookhq.com</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9f9fc;border-top:1px solid #ebebf0;padding:16px 40px;border-radius:0 0 16px 16px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#b0b0c0;">You received this because you have an active request with ProBook. Questions? Reply to this email.</p>
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

// Cancel / Reschedule action links for homeowner emails
function actionLinks(cancelUrl, rescheduleUrl) {
  return `
  <tr><td style="padding:20px 0 4px;border-top:1px solid #f0f0f5;">
    <p style="margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;text-align:center;">Need to make a change?</p>
    <table role="presentation" cellspacing="0" cellpadding="0" align="center">
      <tr>
        <td style="padding-right:10px;">
          <a href="${rescheduleUrl}" style="display:inline-block;background:#f5f3ff;color:#6366f1;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #e0e7ff;">
            &#128197; Reschedule
          </a>
        </td>
        <td>
          <a href="${cancelUrl}" style="display:inline-block;background:#fff5f5;color:#dc2626;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #fee2e2;">
            &#10005; Cancel
          </a>
        </td>
      </tr>
    </table>
  </td></tr>`;
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
    accentColor: '#6366f1',
    label: 'YOUR CONTRACTOR MATCH',
    headline: `You've been matched!`,
    sub: `${contractorName} is ready for your project.`,
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
        ${stepCard(2, 'Get a confirmation', 'You\'ll get a confirmation email the moment you book.')}
        ${stepCard(3, 'Your contractor arrives', `${contractorName} will show up ready to help with your project.`)}
      </td></tr>

      ${calloutBox('<strong>Heads up:</strong> This booking link expires in 48 hours. Add bookings@probookhq.com to your contacts so future emails don\'t get missed.')}

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
    accentColor: '#6366f1',
    label: 'NEW LEAD ASSIGNED',
    headline: esc(lead.name),
    sub: `${esc(lead.zip_code)} &mdash; booking link sent`,
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

      ${ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard')}`,
  });
  return sendEmail(contractor.email, `New lead assigned: ${lead.name} in ${lead.zip_code} | ${BRAND}`, html);
}

async function sendAppointmentConfirmation(lead, contractor, appointment) {
  const dateStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const isReschedule = !!appointment.is_reschedule;

  const makeHtml = (recipientName, otherPartyName, isContractor = false) => emailBase({
    accentColor: '#6366f1',
    label: isContractor && isReschedule ? 'APPOINTMENT RESCHEDULED' : 'APPOINTMENT CONFIRMED',
    headline: isContractor
      ? (isReschedule ? `Appointment rescheduled` : `Appointment confirmed`)
      : `You're all set!`,
    sub: isContractor
      ? (isReschedule
          ? `${esc(otherPartyName)} has rescheduled their appointment.`
          : `An appointment with ${esc(otherPartyName)} has been confirmed.`)
      : `Your appointment with ${esc(otherPartyName)} is confirmed.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(recipientName)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          ${isContractor
            ? (isReschedule
                ? `<strong>${esc(otherPartyName)}</strong> has rescheduled their appointment to a new time. Please review the updated details below:`
                : `An appointment has been confirmed with <strong>${esc(otherPartyName)}</strong>. Here are the details:`)
            : `Your appointment has been confirmed. Here are your details:`}
        </p>
      </td></tr>

      ${apptCard(dateStr, fmtTime(appointment.scheduled_time))}

      ${sectionLabel(isContractor && isReschedule ? "Updated Schedule" : "What Happens Next")}
      <tr><td style="padding:0 0 20px;">
        ${isContractor ? `
        ${stepCard(1, isReschedule ? 'All updated' : 'Review the lead details', isReschedule ? 'Your ProBook schedule reflects the new time. If you have Google Calendar connected, it\'s already synced.' : 'Check the homeowner\'s project description before the visit.')}
        ${stepCard(2, 'Show up ready', `Arrive at the scheduled time prepared to assess and discuss the project with ${esc(otherPartyName)}.`)}
        ${stepCard(3, 'Close the job', 'Provide your quote or service on-site. ProBook will keep sending you matched leads.')}
        ` : `
        ${stepCard(1, 'You\'re all set', 'No additional steps needed — your contractor will handle the rest.')}
        ${stepCard(2, 'Be ready for your contractor', `${esc(otherPartyName)} will arrive at the scheduled time.`)}
        ${stepCard(3, 'Questions?', 'Reply to this email anytime and we\'ll get back to you right away.')}
        `}
      </td></tr>

      ${isContractor ? ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard') : ''}

      ${!isContractor && appointment.cancel_token ? actionLinks(
        `${APP_URL}/cancel/${appointment.cancel_token}`,
        `${APP_URL}/reschedule/${appointment.reschedule_token}`
      ) : ''}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">${isContractor ? 'If you need to cancel, use your dashboard or reply to this email.' : 'Questions? Reply to this email and we\'ll get back to you right away.'}</p>
      </td></tr>`,
  });

  const contractorSubject = isReschedule
    ? `Appointment rescheduled: ${dateStr} — ${lead.name} | ${BRAND}`
    : `Appointment confirmed: ${dateStr} — ${lead.name} | ${BRAND}`;

  await Promise.allSettled([
    sendEmail(lead.email,       `Appointment confirmed: ${dateStr} | ${BRAND}`, makeHtml(lead.name, contractor.company_name || contractor.name, false)),
    sendEmail(contractor.email, contractorSubject,                               makeHtml(contractor.name, lead.name, true)),
  ]);
}

async function sendCancellationAndRebook(lead, contractor, newBookingUrl) {
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'APPOINTMENT UPDATE',
    headline: `Your appointment was cancelled`,
    sub: `No worries — we'll get you rebooked right away.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(lead.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Unfortunately, <strong>${esc(contractor.company_name || contractor.name)}</strong> had to cancel your appointment. We've already issued you a new booking link so you can pick a new time without any extra hassle.
        </p>
      </td></tr>

      ${ctaBtn(newBookingUrl, 'Pick a New Time')}

      ${calloutBox('<strong>Your new booking link is active and ready.</strong> Simply click the button above to choose a new appointment time. This link expires in 48 hours.')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Sorry for the disruption — if you have any questions, just reply to this email.</p>
      </td></tr>`,
  });
  return sendEmail(lead.email, `Your appointment was cancelled — rebook now | ${BRAND}`, html);
}

// Notify admin when no contractor could be matched to a new lead
async function sendAdminNoMatch(lead) {
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'ACTION REQUIRED',
    headline: `Unmatched Lead`,
    sub: `No contractor available for ${esc(lead.zip_code)}.`,
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

      ${ctaBtn(`${APP_URL}/admin`, 'Open Admin Dashboard')}`,
  });
  return sendEmail(ADMIN_EMAIL, `[Action Required] Unmatched lead — ${lead.name} in ${lead.zip_code} | ${BRAND}`, html);
}

async function sendAppointmentReminder(appt) {
  const dateStr = new Date(appt.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const homeownerHtml = emailBase({
    accentColor: '#6366f1',
    label: 'APPOINTMENT REMINDER',
    headline: `Your appointment is tomorrow`,
    sub: `Just a heads-up so you're ready.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(appt.lead_name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Your appointment with <strong>${esc(appt.company_name || appt.contractor_name)}</strong> is scheduled for tomorrow.
        </p>
      </td></tr>

      ${apptCard(dateStr, fmtTime(appt.scheduled_time))}

      ${appt.cancel_token ? actionLinks(
        `${APP_URL}/cancel/${appt.cancel_token}`,
        `${APP_URL}/reschedule/${appt.reschedule_token}`
      ) : calloutBox('If anything comes up and you need to reschedule, please reply to this email as soon as possible so we can find you a new time.')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Your contractor will be there — we'll see you on the day.</p>
      </td></tr>`,
  });

  const contractorHtml = emailBase({
    accentColor: '#6366f1',
    label: 'APPOINTMENT REMINDER',
    headline: `You have an appointment tomorrow`,
    sub: `${esc(appt.lead_name)} &mdash; ${dateStr}`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(appt.contractor_name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          You have an appointment with <strong>${esc(appt.lead_name)}</strong> tomorrow.
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

// Rebook link for homeowner-initiated cancellation (correct framing — they cancelled, not the contractor)
async function sendHomeownerRebookLink(lead, contractor, bookingUrl) {
  const contractorName = esc(contractor.company_name || contractor.name);
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'APPOINTMENT CANCELLED',
    headline: `Your appointment was cancelled`,
    sub: `Here's a new link to rebook whenever you're ready.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(lead.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Your appointment with <strong>${contractorName}</strong> has been cancelled. Use the link below to pick a new time whenever works for you.
        </p>
      </td></tr>

      ${ctaBtn(bookingUrl, 'Pick a New Time')}

      ${calloutBox('<strong>Your booking link is active and ready.</strong> This link expires in 48 hours.')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Questions? Just reply to this email and we'll get back to you right away.</p>
      </td></tr>`,
  });
  return sendEmail(lead.email, `Your appointment was cancelled — book a new time | ${BRAND}`, html);
}

// Notify contractor when homeowner cancels via self-service link
async function sendHomeownerCancelledNotice(contractor, lead, appointment) {
  const dateStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'APPOINTMENT CANCELLED',
    headline: `Appointment cancelled`,
    sub: `${esc(lead.name)} cancelled their appointment.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(contractor.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 4px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          <strong>${esc(lead.name)}</strong> has cancelled their appointment scheduled for ${dateStr}. We've sent them a new booking link so they can reschedule. No action needed on your end — ProBook will keep sending you matched leads.
        </p>
      </td></tr>

      ${ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard')}`,
  });
  return sendEmail(
    contractor.email,
    `Appointment cancelled by homeowner — ${esc(lead.name)} | ${BRAND}`,
    html
  );
}

// ── Contractor declined ───────────────────────────────────────────────────────
async function sendContractorDeclined(contractor) {
  const html = emailBase({
    accentColor: '#6b7280',
    label: 'APPLICATION UPDATE',
    headline: `Your application wasn't approved`,
    sub: `Thank you for your interest in partnering with ${BRAND}.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Hi <strong>${esc(contractor.name)}</strong>,
        </p>
      </td></tr>
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          After reviewing your application, we've decided not to move forward at this time. This could be due to service area overlap, capacity, or niche coverage — it's not a reflection of your business.
        </p>
      </td></tr>
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          If your situation changes or you'd like to reapply in the future, feel free to reach out by replying to this email.
        </p>
      </td></tr>`,
  });
  return sendEmail(contractor.email, `Application update — ${BRAND}`, html);
}

// ── Contractor applied: ack to applicant ──────────────────────────────────────
async function sendContractorApplicationAck(contractor) {
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'APPLICATION RECEIVED',
    headline: `We received your application`,
    sub: `Thanks for applying to partner with ${BRAND}.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(contractor.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Thanks for applying to join the ${BRAND} contractor network. We've received your application and our team will review it within <strong>1–2 business days</strong>.
        </p>
      </td></tr>

      ${sectionLabel('Your Application Details')}
      <tr><td style="padding:0 0 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${infoRow('Name',       esc(contractor.name),              true)}
          ${infoRow('Email',      esc(contractor.email))}
          ${infoRow('Service',    esc(contractor.niche_name),        true)}
          ${infoRow('Zip Codes',  esc(contractor.service_zip_codes))}
        </table>
      </td></tr>

      ${calloutBox(`Once approved, you'll receive a welcome email with instructions to log in, set your availability, and start receiving matched leads.`)}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Questions? Reply to this email and we'll get back to you right away.</p>
      </td></tr>`,
  });
  return sendEmail(contractor.email, `Application received — ${BRAND}`, html);
}

// ── Contractor applied: alert to admin ───────────────────────────────────────
async function sendContractorApplicationAlert(contractor) {
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'NEW APPLICATION',
    headline: `New contractor application`,
    sub: `${esc(contractor.name)} has applied to join the network.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          A new contractor has submitted an application. Review their details and approve from the admin dashboard.
        </p>
      </td></tr>

      ${sectionLabel('Applicant Details')}
      <tr><td style="padding:0 0 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${infoRow('Name',       esc(contractor.name),              true)}
          ${infoRow('Email',      esc(contractor.email))}
          ${infoRow('Phone',      esc(contractor.phone || 'Not provided'), true)}
          ${infoRow('Company',    esc(contractor.company_name || 'Not provided'))}
          ${infoRow('Service',    esc(contractor.niche_name),        true)}
          ${infoRow('Zip Codes',  esc(contractor.service_zip_codes))}
        </table>
      </td></tr>

      ${ctaBtn(`${APP_URL}/admin`, 'Review in Dashboard')}`,
  });
  return sendEmail(ADMIN_EMAIL, `[New Application] ${contractor.name} — ${contractor.niche_name} | ${BRAND}`, html);
}

// ── Contractor approved ───────────────────────────────────────────────────────
async function sendContractorApproved(contractor) {
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'YOU\'RE APPROVED',
    headline: `Welcome to ${BRAND}!`,
    sub: `Your contractor account is now active.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(contractor.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Great news — your application has been approved! Your ${BRAND} account is now active and ready to go.
        </p>
      </td></tr>

      ${sectionLabel('Get Started')}
      <tr><td style="padding:0 0 20px;">
        ${stepCard(1, 'Log in to your portal', `Visit ${APP_URL}/login and sign in with the email and password you set during your application.`)}
        ${stepCard(2, 'Set your availability', 'Head to My Schedule in your portal and add the hours you\'re available each week. ProBook will only book appointments during these windows.')}
        ${stepCard(3, 'Start receiving leads', 'Once your availability is set, ProBook will automatically match you with homeowners in your area and send you confirmed appointments.')}
      </td></tr>

      ${ctaBtn(`${APP_URL}/login`, 'Log In to Your Portal')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Questions? Reply to this email anytime.</p>
      </td></tr>`,
  });
  return sendEmail(contractor.email, `You're approved — welcome to ${BRAND}!`, html);
}

module.exports = { sendBookingLink, notifyContractor, sendAppointmentConfirmation, sendCancellationAndRebook, sendAdminNoMatch, sendAppointmentReminder, sendHomeownerCancelledNotice, sendHomeownerRebookLink, sendContractorApplicationAck, sendContractorApplicationAlert, sendContractorApproved, sendContractorDeclined };
