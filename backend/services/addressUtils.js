/**
 * addressUtils.js — shared address/zip parsing helpers.
 *
 * Pulled out of homeownerSmsAI.js (task #88) after a live-caught bug: extractZip
 * used to trust ANY 5-digit substring in an address as a real zip code, with no
 * validation. A rural or long-numbered address with no real zip present (e.g.
 * "12345 Old Mill Rd", no zip at the end) would have its 5-digit HOUSE NUMBER
 * silently mistaken for a real zip — producing a confident but wrong
 * in-area/out-of-area answer instead of correctly recognizing that no real zip
 * was given. Also: this exact regex used to be duplicated near-verbatim in
 * matchingEngine.js as extractZipFromAddress — the same class of "same fix has
 * to land in two places, one gets missed" drift that has caused repeat bugs
 * elsewhere in this codebase (see aiChat.js/smsAI.js tool_use parity, task #29).
 * Both files now import from here instead of keeping their own copy.
 */

const zipcodes = require('zipcodes');

// True only if `zip` is a real, known US zip code per the offline zipcodes DB —
// never trust a bare 5-digit regex match on its own.
function isValidZip(zip) {
  if (!zip) return false;
  return !!zipcodes.lookup(zip);
}

// Extracts a zip code from a free-text address. Scans every 5-digit token found
// (in "as address, city, zip" order, so scanning from the END is the normal
// case) and returns the first one that validates as a REAL zip — never just the
// last 5-digit substring blindly. Returns null if no token in the address
// validates, which is the correct/safe outcome for something like a 5-digit
// house number with no real zip anywhere in the string.
//
// Task #97 — live-caught: the "no real zip in the string" case above only
// protected against a house number that *isn't* a real zip anywhere in the
// US. "20722 Olympic Pl NE Apt A110" has no zip at all, but 20722 happens to
// coincidentally be a real zip code somewhere else in the country — isValidZip
// passed it, and it got silently used as the homeowner's zip, resolving
// straight to "out of area" instead of correctly asking for the zip. A US
// address always puts the zip at the END, never the start — a 5-digit token
// sitting at position 0 of a longer string is a house number, full stop,
// regardless of whether it happens to validate as *some* real zip elsewhere.
// Exclude a leading match from candidacy unless the leading token IS the
// entire string (a bare "98223" reply with nothing else — still legitimate).
function extractZip(address) {
  const str = (address || '').trim();
  if (!str) return null;

  const re = /\b(\d{5})(?:-\d{4})?\b/g;
  const candidates = [];
  let m;
  while ((m = re.exec(str)) !== null) {
    candidates.push({ zip: m[1], index: m.index });
  }
  if (!candidates.length) return null;

  const usable = candidates.filter(c => {
    if (c.index !== 0) return true;
    return str.slice(5).trim().length === 0; // leading token is the whole string — keep it
  });
  if (!usable.length) return null;

  for (let i = usable.length - 1; i >= 0; i--) {
    if (isValidZip(usable[i].zip)) return usable[i].zip;
  }
  return null;
}

module.exports = { extractZip, isValidZip };
