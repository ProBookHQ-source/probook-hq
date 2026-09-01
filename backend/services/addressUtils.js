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
function extractZip(address) {
  const matches = (address || '').match(/\b(\d{5})(?:-\d{4})?\b/g);
  if (!matches) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = matches[i].slice(0, 5);
    if (isValidZip(candidate)) return candidate;
  }
  return null;
}

module.exports = { extractZip, isValidZip };
