const nodemailer = require('nodemailer');

// Configure your SMTP provider (Gmail, SendGrid, etc.)
// Set these in your .env file
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465, // port 465 = TLS (Resend); 587 = STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.FROM_EMAIL || 'noreply@yourdomain.com';
const BRAND = process.env.BRAND_NAME || 'ProBook';

async function sendBookingLink(lead, contractor, bookingUrl) {
  if (!process.env.SMTP_USER) {
    console.log(`[EMAIL SKIPPED - no SMTP configured] Would send booking link to ${lead.email}`);
    console.log(`Booking URL: ${bookingUrl}`);
    return;
  }

  await transporter.sendMail({
    from: `${BRAND} <${FROM}>`,
    to: lead.email,
    subject: `Your appointment is ready to schedule — ${BRAND}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a2e;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${BRAND}</h1>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1a1a2e; margin-top: 0;">Hi ${lead.name}!</h2>
          <p>Great news — we've matched you with <strong>${contractor.company_name || contractor.name}</strong> for your project.</p>
          <p>Click below to pick a time that works for you:</p>
          <a href="${bookingUrl}" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 16px 0;">
            Pick Your Appointment Time →
          </a>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 48 hours. If you have questions, reply to this email.</p>
        </div>
      </div>
    `,
  });
}

async function notifyContractor(contractor, lead) {
  if (!process.env.SMTP_USER) {
    console.log(`[EMAIL SKIPPED] Would notify contractor ${contractor.email} of new lead ${lead.name}`);
    return;
  }

  await transporter.sendMail({
    from: `${BRAND} <${FROM}>`,
    to: contractor.email,
    subject: `New lead assigned: ${lead.name} — ${lead.zip_code}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">${BRAND}</h1>
        </div>
        <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="margin-top: 0;">New Lead Assigned 🎉</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6b7280;">Name</td><td style="padding: 8px 0; font-weight: 600;">${lead.name}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Location</td><td style="padding: 8px 0; font-weight: 600;">${lead.zip_code}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Project</td><td style="padding: 8px 0;">${lead.description || 'No description provided'}</td></tr>
          </table>
          <p style="color: #6b7280; margin-top: 24px;">The homeowner has been sent a booking link — you'll receive a calendar invite once they confirm.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/contractor" style="display: inline-block; background: #6366f1; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600;">
            View Your Dashboard →
          </a>
        </div>
      </div>
    `,
  });
}

async function sendAppointmentConfirmation(lead, contractor, appointment) {
  if (!process.env.SMTP_USER) return;

  const dateStr = new Date(appointment.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const emailTo = async (to, name, otherPartyLabel, otherPartyName) => {
    await transporter.sendMail({
      from: `${BRAND} <${FROM}>`,
      to,
      subject: `Appointment Confirmed: ${dateStr}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 32px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0;">Appointment Confirmed ✓</h1>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p>Hi ${name},</p>
            <p>Your appointment with <strong>${otherPartyName}</strong> is confirmed.</p>
            <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; border-radius: 4px; margin: 20px 0;">
              <strong>📅 ${dateStr}</strong><br>
              <strong>🕐 ${appointment.scheduled_time}</strong>
            </div>
          </div>
        </div>
      `,
    });
  };

  await Promise.allSettled([
    emailTo(lead.email, lead.name, 'contractor', contractor.company_name || contractor.name),
    emailTo(contractor.email, contractor.name, 'homeowner', lead.name),
  ]);
}

module.exports = { sendBookingLink, notifyContractor, sendAppointmentConfirmation };
