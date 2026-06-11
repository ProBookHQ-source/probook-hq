/**
 * Google Calendar Integration
 * ────────────────────────────
 * Uses OAuth2 with offline access so contractors grant permission once
 * and we can sync events on their behalf forever (until revoked).
 *
 * Setup:
 *   1. Create a Google Cloud project
 *   2. Enable Google Calendar API
 *   3. Create OAuth2 credentials (Web application)
 *   4. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI to .env
 */

const { google } = require('googleapis');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback'
  );
}

// Generate OAuth URL to send contractor to Google's consent screen
function getAuthUrl(contractorId) {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: contractorId, // passed back in callback so we know who it is
  });
}

// Exchange code for tokens after contractor approves
async function exchangeCode(code) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens; // save tokens.refresh_token to contractor record
}

// Get an authenticated calendar client for a contractor
function getCalendarClient(refreshToken) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth: oauth2 });
}

// Create a calendar event and return its ID
async function createEvent(contractor, lead, date, time) {
  if (!contractor.google_refresh_token) return null;
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log('[GOOGLE CAL SKIPPED - not configured] Would create event for:', date, time);
    return null;
  }

  try {
    const calendar = getCalendarClient(contractor.google_refresh_token);
    const [hour, minute] = time.split(':').map(Number);
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour

    const event = await calendar.events.insert({
      calendarId: contractor.google_calendar_id || 'primary',
      requestBody: {
        summary: `Appointment: ${lead.name}`,
        description: `Lead Info:\nName: ${lead.name}\nPhone: ${lead.phone || 'N/A'}\nEmail: ${lead.email}\n\nProject: ${lead.description || 'N/A'}`,
        start: { dateTime: start.toISOString(), timeZone: 'America/New_York' },
        end:   { dateTime: end.toISOString(),   timeZone: 'America/New_York' },
        attendees: [{ email: lead.email, displayName: lead.name }],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 1440 }, // 24h before
            { method: 'popup', minutes: 60 },   // 1h before
          ],
        },
      },
    });
    return event.data.id;
  } catch (err) {
    console.error('Google Calendar createEvent error:', err.message);
    return null;
  }
}

// Delete an event (on cancellation)
async function deleteEvent(contractor, eventId) {
  if (!contractor.google_refresh_token || !process.env.GOOGLE_CLIENT_ID) return;
  try {
    const calendar = getCalendarClient(contractor.google_refresh_token);
    await calendar.events.delete({
      calendarId: contractor.google_calendar_id || 'primary',
      eventId,
    });
  } catch (err) {
    console.error('Google Calendar deleteEvent error:', err.message);
  }
}

module.exports = { getAuthUrl, exchangeCode, createEvent, deleteEvent };
