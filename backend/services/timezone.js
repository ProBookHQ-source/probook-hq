/**
 * timezone.js — shared contractor-timezone resolution.
 *
 * Built session 34/35 (Sept 13) after a real live-caught bug: the SMS crons in
 * cron.js (post-job "how'd it go" check-in, morning-of confirmation, 24hr
 * reminder) computed their send windows using the SERVER's own local/UTC wall
 * clock and compared it directly against `appointments.scheduled_date`/
 * `scheduled_time`, which are stored as plain local-time strings meant to be
 * read in the CONTRACTOR's own timezone. A Washington (Pacific) contractor
 * with a 10:00 AM appointment got the "how'd the 10 AM job go?" text at
 * ~7:30 AM Pacific — 3 hours early — because the cron's "30-90 minutes after"
 * window was computed off the server process's local time (effectively
 * Eastern), not the contractor's real timezone.
 *
 * homeownerSmsAI.js already had a reasonable fix for this exact class of
 * problem (task #99/#100, session 31) for its own same-day-slot-offer logic —
 * a zip→state→IANA-timezone approximation, since there was no real timezone
 * column on contractors. That logic is extracted here so cron.js, the signup
 * flow, and homeownerSmsAI.js all share one source of truth instead of three
 * independent copies quietly drifting apart (the exact bug class that has
 * bitten this codebase before — see addressUtils.js's own header, and the
 * aiChat.js/smsAI.js tool_use parity bug, task #29).
 *
 * `contractors.timezone` (added this same session) is now the source of
 * truth going forward — computed once at signup from the business address
 * and stored, rather than re-derived from a zip lookup on every use. Every
 * helper below still accepts a bare address string for callers/rows that
 * predate the column (falls back to the same approximation), so nothing
 * breaks for contractors created before this migration ran.
 *
 * Still an approximation, not billing-grade: split-timezone states (IN, KY,
 * FL panhandle, west TX, etc.) are approximated to their majority-population
 * zone. Good enough for SMS timing and same-day slot cutoffs.
 */

const zipcodes = require('zipcodes');
const { extractZip } = require('./addressUtils');

const STATE_TIMEZONE = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix',
  AR: 'America/Chicago', CA: 'America/Los_Angeles', CO: 'America/Denver',
  CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Denver',
  IL: 'America/Chicago', IN: 'America/New_York', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago',
  ME: 'America/New_York', MD: 'America/New_York', MA: 'America/New_York',
  MI: 'America/New_York', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York',
  NM: 'America/Denver', NY: 'America/New_York', NC: 'America/New_York',
  ND: 'America/Chicago', OH: 'America/New_York', OK: 'America/Chicago',
  OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago',
  TX: 'America/Chicago', UT: 'America/Denver', VT: 'America/New_York',
  VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York',
  WI: 'America/Chicago', WY: 'America/Denver', DC: 'America/New_York',
};

// Derives an approximate IANA timezone from a free-text business address via
// its zip code. Returns 'America/Los_Angeles' if nothing resolves — a safe,
// arbitrary default, not a meaningful guess (matches the pre-existing
// fallback behavior in homeownerSmsAI.js so nothing changes for callers
// already relying on that default).
function resolveTimezoneFromAddress(address) {
  try {
    const zip = extractZip(address);
    const info = zip ? zipcodes.lookup(zip) : null;
    return (info?.state && STATE_TIMEZONE[info.state]) || 'America/Los_Angeles';
  } catch (e) {
    return 'America/Los_Angeles';
  }
}

// Accepts a contractor row/object (prefers a stored `.timezone`, falls back
// to deriving one from `.address`), a bare address string, or an IANA zone
// string directly (detected by the presence of a "/"). Always returns a
// usable IANA timezone string.
function resolveContractorTimezone(input) {
  if (!input) return 'America/Los_Angeles';
  if (typeof input === 'string') {
    return input.includes('/') ? input : resolveTimezoneFromAddress(input);
  }
  if (input.timezone) return input.timezone;
  if (input.address) return resolveTimezoneFromAddress(input.address);
  return 'America/Los_Angeles';
}

// Returns { dateStr: 'YYYY-MM-DD', minutes } for "right now" in the given
// timezone (minutes = minutes since local midnight).
function getLocalNow(timezoneInput) {
  const tz = resolveContractorTimezone(timezoneInput);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = t => parts.find(p => p.type === t)?.value;
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
    let hour = parseInt(get('hour'), 10);
    if (hour === 24) hour = 0; // some ICU builds return "24" for midnight with hour12:false
    return { dateStr, minutes: hour * 60 + parseInt(get('minute'), 10) };
  } catch (e) {
    console.warn('[timezone] getLocalNow: Intl timezone lookup failed, falling back to UTC:', e.message);
    const now = new Date();
    return { dateStr: now.toISOString().slice(0, 10), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
  }
}

// Parses "HH:MM" or "HH:MM:SS" into minutes since midnight. Returns null on
// anything unparseable rather than throwing — callers should skip the row.
function timeStrToMinutes(timeStr) {
  if (!timeStr) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(timeStr).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

// Whole-day difference between two 'YYYY-MM-DD' strings (b - a), computed via
// Date.UTC so it's never affected by the server process's own timezone.
function daysBetweenDateStrings(aStr, bStr) {
  const [aY, aM, aD] = aStr.split('-').map(Number);
  const [bY, bM, bD] = bStr.split('-').map(Number);
  const a = Date.UTC(aY, aM - 1, aD);
  const b = Date.UTC(bY, bM - 1, bD);
  return Math.round((b - a) / 86400000);
}

module.exports = {
  STATE_TIMEZONE,
  resolveTimezoneFromAddress,
  resolveContractorTimezone,
  getLocalNow,
  timeStrToMinutes,
  daysBetweenDateStrings,
};
