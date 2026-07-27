/**
 * Notifications — powered by Resend HTTP API
 * Uses HTTPS port 443 so no firewall issues on any host.
 * Set RESEND_API_KEY (or SMTP_PASS as fallback) in your env vars.
 */
const https = require('https');

const FROM      = process.env.FROM_EMAIL  || 'bookings@tractifyhq.com';

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
const BRAND     = process.env.BRAND_NAME  || 'Tractify';
const APP_URL   = process.env.FRONTEND_URL || 'https://probook-hq-production.up.railway.app';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.FROM_EMAIL || 'bookings@tractifyhq.com';

// Prevent XSS in email HTML — escape user-supplied strings before inserting into templates
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Strip HTML tags to produce a plain text fallback — helps Gmail route to Primary vs Promotions
function htmlToText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&mdash;/g, '—').replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ').trim();
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
    text: htmlToText(html), // plain text version — improves deliverability and inbox placement
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
  const iconImg = `<img src="${APP_URL}/probook-icon-128.png" width="36" height="36" alt="Tractify" style="display:block;border-radius:8px;" />`;

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
          <span style="font-size:24px;font-weight:800;color:${accentColor};letter-spacing:-0.5px;">Tractify</span>
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
          <img src="${APP_URL}/probook-icon-128.png" width="44" height="44" alt="Tractify" style="display:block;border-radius:10px;" />
        </td>
        <td style="vertical-align:middle;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#1a1a2e;">The <span style="color:${accentColor};">Tractify</span> Team</p>
          <p style="margin:2px 0 0;font-size:13px;color:#9ca3af;">bookings@tractifyhq.com &nbsp;·&nbsp; tractifyhq.com</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9f9fc;border-top:1px solid #ebebf0;padding:16px 40px;border-radius:0 0 16px 16px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#b0b0c0;">You received this because you have an active request with Tractify. Questions? Reply to this email.</p>
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
    label: 'BOOK YOUR APPOINTMENT',
    headline: `Your appointment is one click away.`,
    sub: `${contractorName} has an opening for you — pick a time below.`,
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:16px;color:#374151;">Hi <strong>${esc(lead.name)}</strong>,</p>
      </td></tr>
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          Thanks for reaching out to <strong>${contractorName}</strong>. Use the link below to choose an appointment time that works for you — no phone call needed.
        </p>
      </td></tr>

      ${ctaBtn(bookingUrl, 'Choose Your Appointment Time')}

      ${sectionLabel("Here's What Happens Next")}
      <tr><td style="padding:0 0 8px;">
        ${stepCard(1, 'Pick your time', 'Browse available slots and choose whatever works for your schedule.')}
        ${stepCard(2, 'Get a confirmation', 'You\'ll receive a confirmation email the moment you book.')}
        ${stepCard(3, 'Your contractor arrives', `${contractorName} will come out at the scheduled time, ready to go.`)}
      </td></tr>

      ${calloutBox('<strong>Heads up:</strong> This link expires in 48 hours. If you need more time, just reply to this email and we\'ll send you a new one.')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Questions? Just reply to this email and we'll get back to you right away.</p>
      </td></tr>`,
  });
  return sendEmail(lead.email, `Book your appointment with ${esc(contractor.company_name || contractor.name)}`, html);
}

async function notifyContractor(contractor, lead) {
  let metaRows = '';
  try {
    const meta = lead.metadata
      ? (typeof lead.metadata === 'string' ? JSON.parse(lead.metadata) : lead.metadata)
      : {};
    const labelMap = {
      service_type: 'Service Requested',
      address: 'Address',
      heating: 'Heating System', oil_tank: 'Oil Tank', ductwork: 'Ductwork',
      year_built: 'Year Built', square_footage: 'Square Footage', monthly_oil_bill: 'Monthly Oil Bill',
      reason: 'Reason for Switch', timeline: 'Timeline', homeowner: 'Homeowner Status',
      household_size: 'Household Size', income: 'Income Bracket',
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
  return sendEmail(contractor.email, `New lead: ${esc(lead.name)} — ${esc(lead.zip_code)}`, html);
}

async function sendAppointmentConfirmation(lead, contractor, appointment) {
  const dateStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const isReschedule = !!appointment.is_reschedule;

  // Pull address + service type from lead metadata for contractor email
  let leadMeta = {};
  try { leadMeta = lead.metadata ? (typeof lead.metadata === 'string' ? JSON.parse(lead.metadata) : lead.metadata) : {}; } catch (e) {}
  const serviceAddress = leadMeta.address ? `${leadMeta.address}, ${lead.zip_code}` : lead.zip_code;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(serviceAddress)}`;
  const serviceType = leadMeta.service_type || null;

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

      ${!isContractor ? sectionLabel("What Happens Next") : ''}
      <tr><td style="padding:0 0 20px;">
        ${isContractor ? `
        ${sectionLabel('Job Details')}
        <tr><td>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${infoRow('Customer', esc(otherPartyName), true)}
            ${lead.phone ? infoRow('Phone', `<a href="tel:${esc(lead.phone)}" style="color:#6366f1;text-decoration:none;">${esc(lead.phone)}</a>`) : ''}
            ${lead.email ? infoRow('Email', `<a href="mailto:${esc(lead.email)}" style="color:#6366f1;text-decoration:none;">${esc(lead.email)}</a>`) : ''}
            ${serviceType ? infoRow('Service', esc(serviceType), true) : ''}
            ${infoRow('Address', `<a href="${mapsUrl}" style="color:#6366f1;text-decoration:none;font-weight:600;">${esc(serviceAddress)}</a><br><span style="font-size:12px;color:#9ca3af;">Tap to open in Google Maps &rarr;</span>`)}
          </table>
        </td></tr>
        ${sectionLabel('Next Steps')}
        <tr><td style="padding:0 0 20px;">
        ${stepCard(1, isReschedule ? 'Schedule updated' : 'Review before the visit', isReschedule ? 'Your Tractify schedule reflects the new time.' : `Review the job details above and reach out to ${esc(otherPartyName)} if you have any questions before the appointment.`)}
        ${stepCard(2, 'Show up on time', `Arrive at the address above at the scheduled time ready to assess the job.`)}
        ${stepCard(3, 'Close the job', 'Provide your quote or complete the service. Tractify will keep sending you booked appointments.')}
        </td></tr>
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
    ? `Rescheduled: ${lead.name} — ${dateStr}`
    : `Confirmed: ${lead.name} — ${dateStr}`;

  await Promise.allSettled([
    sendEmail(lead.email,       `Your appointment is confirmed — ${dateStr}`, makeHtml(lead.name, contractor.company_name || contractor.name, false)),
    sendEmail(contractor.email, contractorSubject,                             makeHtml(contractor.name, lead.name, true)),
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
  return sendEmail(lead.email, `Your appointment was cancelled — here's your new booking link`, html);
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
    sendEmail(appt.lead_email,       `Your appointment is tomorrow`,                          homeownerHtml),
    sendEmail(appt.contractor_email, `Tomorrow: appointment with ${appt.lead_name}`,           contractorHtml),
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
  return sendEmail(lead.email, `Your appointment was cancelled — book a new time`, html);
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
          <strong>${esc(lead.name)}</strong> has cancelled their appointment scheduled for ${dateStr}. We've sent them a new booking link so they can reschedule. No action needed on your end — Tractify will keep sending you matched leads.
        </p>
      </td></tr>

      ${ctaBtn(`${APP_URL}/contractor`, 'View Your Dashboard')}`,
  });
  return sendEmail(
    contractor.email,
    `Cancelled: ${esc(lead.name)} — ${dateStr}`,
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
  return sendEmail(contractor.email, `Your Tractify application`, html);
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
  return sendEmail(contractor.email, `We received your application`, html);
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
        ${stepCard(2, 'Set your availability', 'Head to My Schedule in your portal and add the hours you\'re available each week. Tractify will only book appointments during these windows.')}
        ${stepCard(3, 'Start receiving leads', 'Once your availability is set, Tractify will automatically match you with homeowners in your area and send you confirmed appointments.')}
      </td></tr>

      ${ctaBtn(`${APP_URL}/login`, 'Log In to Your Portal')}

      <tr><td>
        <p style="margin:0;font-size:13px;color:#9ca3af;">Questions? Reply to this email anytime.</p>
      </td></tr>`,
  });
  return sendEmail(contractor.email, `You're approved — welcome to ${BRAND}!`, html);
}

// ── Password reset ────────────────────────────────────────────────────────────
async function sendPasswordReset(contractor, resetUrl) {
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'Password Reset',
    headline: 'Reset your password',
    sub: `Hi ${esc(contractor.name)} — here's your password reset link.`,
    bodyContent: `
      <tr><td style="padding-bottom:16px;">
        <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
          Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
        </p>
      </td></tr>
      <tr><td style="padding-bottom:16px;">
        <p style="margin:0;font-size:13px;color:#9ca3af;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </td></tr>
      ${ctaBtn(resetUrl, 'Reset My Password')}`,
  });
  return sendEmail(contractor.email, `Reset your ${BRAND} password`, html);
}

// ── Direct booking: confirmation to prospect ──────────────────────────────────
async function sendDirectBookingConfirmation(to, { firstName, contractorDisplayName, fmtDate, fmtTime }) {
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'BOOKING CONFIRMED',
    headline: `You're booked, ${esc(firstName)}! 🎉`,
    sub: 'Here are your call details.',
    bodyContent: `
      ${apptCard(esc(fmtDate), esc(fmtTime), `&#128100;&nbsp; With: ${esc(contractorDisplayName)}`)}
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          We'll reach out on the day of your call. If you have any questions before then, just reply to this email.
        </p>
      </td></tr>`,
  });
  return sendEmail(to, `Your call with ${esc(contractorDisplayName)} is confirmed ✓`, html);
}

// ── Direct booking: alert to contractor ──────────────────────────────────────
async function sendDirectBookingContractorAlert(to, { name, email, phone, notes, fmtDate, fmtTime, appUrl }) {
  const portalUrl = appUrl || APP_URL;
  const html = emailBase({
    accentColor: '#6366f1',
    label: 'NEW BOOKING',
    headline: 'New booking on your calendar',
    bodyContent: `
      ${sectionLabel('Contact Info')}
      <tr><td style="padding:0 0 4px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="background:#f9f9fc;border-radius:10px;padding:4px 0;">
          <tbody>
            ${infoRow('Name', esc(name), true)}
            ${infoRow('Email', `<a href="mailto:${esc(email)}" style="color:#6366f1;text-decoration:none;">${esc(email)}</a>`)}
            ${phone ? infoRow('Phone', `<a href="tel:${esc(phone)}" style="color:#6366f1;text-decoration:none;">${esc(phone)}</a>`) : ''}
            ${notes ? infoRow('Notes', esc(notes)) : ''}
          </tbody>
        </table>
      </td></tr>
      ${sectionLabel('Appointment')}
      ${apptCard(esc(fmtDate), esc(fmtTime))}
      ${ctaBtn(`${portalUrl}/contractor`, 'View in Contractor Portal')}`,
  });
  return sendEmail(to, `New booking: ${esc(name)} — ${esc(fmtDate)} at ${esc(fmtTime)}`, html);
}

// ── Onboarding nudge — contractor hasn't finished setup after 48 hours ─────────
async function sendOnboardingNudge(contractor, completedSteps) {
  const STEPS = [
    { key: 'availability', label: 'Confirm your availability' },
    { key: 'twilio',       label: 'Set up call forwarding' },
    { key: 'gbp',          label: 'Add booking link to Google Business Profile' },
    { key: 'nextdoor',     label: 'Post on Nextdoor' },
    { key: 'facebook',     label: 'Post in a Facebook group' },
    { key: 'reviewers',    label: 'Message your Google reviewers' },
  ];
  const steps = typeof completedSteps === 'string' ? JSON.parse(completedSteps || '{}') : (completedSteps || {});
  const doneCount  = STEPS.filter(s => steps[s.key]).length;
  const remaining  = STEPS.filter(s => !steps[s.key]);
  const portalUrl  = `${APP_URL}/contractor`;

  const stepRows = remaining.map(s =>
    `<tr><td style="padding:6px 16px;font-size:14px;color:#4b5563;border-bottom:1px solid #f3f4f6;">
      ⬜ ${esc(s.label)}
    </td></tr>`
  ).join('');

  const contractorHtml = emailBase({
    accentColor: '#6366f1',
    label: 'ACTION NEEDED',
    headline: `${doneCount} of 6 setup steps done`,
    sub: `Complete your setup to start getting booked jobs, ${esc(contractor.name.split(' ')[0])}.`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6;">
          You're almost there! Finish these remaining steps so Tractify can start sending you booked jobs:
        </p>
      </td></tr>
      <tr><td style="padding:0 0 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="background:#f9f9fc;border-radius:10px;overflow:hidden;">
          <tbody>${stepRows}</tbody>
        </table>
      </td></tr>
      ${ctaBtn(portalUrl, 'Complete My Setup →')}`,
  });

  const adminHtml = emailBase({
    accentColor: '#f59e0b',
    label: 'SETUP STALLED',
    headline: `${esc(contractor.company_name || contractor.name)} hasn't finished setup`,
    sub: `${doneCount} of 6 steps complete after 48 hours.`,
    bodyContent: `
      <tr><td style="padding:0 0 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="background:#f9f9fc;border-radius:10px;overflow:hidden;">
          <tbody>
            ${infoRow('Contractor', esc(contractor.name), true)}
            ${infoRow('Business', esc(contractor.company_name || '—'))}
            ${infoRow('Email', `<a href="mailto:${esc(contractor.email)}" style="color:#6366f1;">${esc(contractor.email)}</a>`)}
            ${infoRow('Steps done', `${doneCount} / 6`)}
            ${infoRow('Missing', remaining.map(s => s.label).join(', '))}
          </tbody>
        </table>
      </td></tr>
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
          Low completion = low engagement. Consider whether to invest paid ads behind this contractor.
        </p>
      </td></tr>`,
  });

  // Notify contractor
  await sendEmail(contractor.email, `Complete your Tractify setup (${doneCount}/6 done)`, contractorHtml).catch(e => console.error('[NUDGE] contractor email failed:', e.message));
  // Notify Jose + Daniel
  await sendEmail('ayc98223@gmail.com', `⚠️ Setup stalled: ${contractor.company_name || contractor.name} (${doneCount}/6 steps)`, adminHtml).catch(e => console.error('[NUDGE] admin email failed:', e.message));
}

// ── Welcome email after auto-deploy ──────────────────────────────────────────
// Sent to the contractor right after their site is deployed.
// { name, email, company, siteUrl, portalUrl, loginEmail, password }
async function sendContractorWelcomeEmail({ name, email, company, siteUrl, portalUrl, loginEmail, password }) {
  const html = emailBase({
    label:    'Welcome to Tractify',
    headline: 'Your booking pipeline is live.',
    sub:      'Log in, complete your setup, and booked jobs start coming in.',
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
          Hi ${esc(name)}, welcome to Tractify. Your pipeline is active and your booking site is live. Log in below to complete your 6-step setup — it takes about 10 minutes and activates all your booking channels.
        </p>
      </td></tr>

      <tr><td style="padding:0 0 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="background:#f5f3ff;border-radius:10px;border-left:4px solid #6366f1;">
          <tr><td style="padding:18px 22px;">
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;">Your Portal Login</p>
            <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>URL:</strong> <a href="${esc(portalUrl)}" style="color:#6366f1;">${esc(portalUrl)}</a></p>
            <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Email:</strong> ${esc(loginEmail)}</p>
            <p style="margin:0;font-size:14px;color:#374151;"><strong>Password:</strong> <code style="background:#ede9fe;padding:2px 6px;border-radius:4px;font-size:13px;">${esc(password)}</code></p>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 8px;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1a1a2e;">What to do next:</p>
        ${stepCard(1, 'Log into your portal', `Go to <a href="${esc(portalUrl)}" style="color:#6366f1;">${esc(portalUrl)}</a> and log in with the credentials above`)}
        ${stepCard(2, 'Complete your 6-step setup', 'Activates all your booking channels — instructions are right inside the portal. Takes about 10 minutes.')}
        ${stepCard(3, 'Watch jobs come in', 'Most contractors see their first booking within the first week. You\'ll be notified the moment one lands.')}
      </td></tr>

      <tr><td style="padding:12px 0 0;">
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
          Questions? Reply to this email — we respond same day.<br>
          <strong>Jose &amp; Daniel — Tractify</strong>
        </p>
      </td></tr>
    `,
  });
  await sendEmail(email, `Welcome to Tractify — your booking pipeline is live`, html);
}

// ── Admin alert after auto-deploy ─────────────────────────────────────────────
async function sendDeployAlertToAdmin({ businessName, contactEmail, siteUrl, contractorId, slug }) {
  const html = emailBase({
    label:    'New Contractor Deployed',
    headline: esc(businessName),
    sub:      'Auto-deploy completed — review and optionally run ads.',
    bodyContent: `
      <tr><td style="padding:0 0 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="background:#f5f3ff;border-radius:10px;border-left:4px solid #6366f1;">
          <tr><td style="padding:18px 22px;">
            <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1a1a2e;">${esc(businessName)}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Email:</strong> ${esc(contactEmail)}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Site:</strong> <a href="${esc(siteUrl)}" style="color:#6366f1;">${esc(siteUrl)}</a></p>
            <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Slug:</strong> ${esc(slug)}</p>
            <p style="margin:0;font-size:14px;color:#374151;"><strong>Contractor ID:</strong> <code style="background:#ede9fe;padding:2px 6px;border-radius:4px;font-size:12px;">${esc(contractorId)}</code></p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 0 8px;">
        <p style="margin:0;font-size:14px;color:#6b7280;">Next: decide if this contractor gets paid ad spend. If yes, run Facebook ads targeting their service zip codes. If the organic channels are strong (GBP, reviewers, Nextdoor) they may hit 5 jobs without ads.</p>
      </td></tr>
    `,
  });
  const adminTo = process.env.ADMIN_EMAIL || 'oiltoheatrebate@gmail.com';
  await sendEmail(adminTo, `New contractor deployed: ${businessName}`, html);
}

module.exports = { sendBookingLink, notifyContractor, sendAppointmentConfirmation, sendCancellationAndRebook, sendAdminNoMatch, sendAppointmentReminder, sendHomeownerCancelledNotice, sendHomeownerRebookLink, sendContractorApplicationAck, sendContractorApplicationAlert, sendContractorApproved, sendContractorDeclined, sendPasswordReset, sendDirectBookingConfirmation, sendDirectBookingContractorAlert, sendOnboardingNudge, sendContractorWelcomeEmail, sendDeployAlertToAdmin };
