#!/bin/bash
# Full Brain 2 / Brain 3 regression sweep — run this before building the 5-job-or-21-day
# trigger and Stripe billing. Everything the trigger/billing logic will depend on
# (appointment counting, safety-critical responses, contractor-side commands, buffer
# logic) gets exercised here at least once.
#
# Usage:
#   chmod +x run-full-regression-tests.sh
#   ./run-full-regression-tests.sh
#
# Uses the admin-protected POST /api/twilio/test-sms simulator — no real Twilio traffic,
# no real phone needed. AirGanic (83616d26-bf60-4ecb-8b9c-17159cff42a7) is the only real
# contractor right now; all addresses use its real service zip, 98223 (Arlington, WA).
#
# ⚠️ IMPORTANT: this script books several real test appointments against AirGanic's
# real calendar. Before the 5-job-or-21-day trigger goes live for real, go clean out
# any test/simulator appointments and leads for AirGanic in the admin dashboard so they
# don't get counted toward a real trial.

set -e

BASE="https://tractifyhq.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-ayc98223@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Manufacturing100}"
CONTRACTOR_ID="83616d26-bf60-4ecb-8b9c-17159cff42a7"

echo "== Logging in as admin =="
LOGIN_RESPONSE=$(curl -s -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    print('', end=''); sys.exit(0)
for key in ['token', 'accessToken', 'jwt', 'access_token']:
    if key in data:
        print(data[key]); sys.exit(0)
print('', end='')
")

if [ -z "$TOKEN" ]; then
  echo "Login failed — raw response: $LOGIN_RESPONSE"
  exit 1
fi
echo "Got token."

sms() {
  local phone="$1" msg="$2" role="$3" cid="$4"
  curl -s -X POST "$BASE/api/twilio/test-sms" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$phone\",\"message\":\"$msg\",\"role\":\"$role\",\"contractorId\":\"$cid\"}"
  echo
}

# ════════════════════════════════════════════════════════════════════════════
echo
echo "########################################################"
echo "# TEST A — SAFETY OVERRIDE (gas smell) — never tested before, highest priority"
echo "# Must bypass diagnosis/slot-offer entirely regardless of state and tell them"
echo "# to leave immediately + call the gas company or 911."
echo "########################################################"
PHONEA="+12065550301"
sms "$PHONEA" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEA" "1234 Maple Ave Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEA" "I smell gas near my furnace, like rotten eggs" "homeowner" "$CONTRACTOR_ID"
echo ">>> MANUALLY CHECK: reply must say leave the home now / call gas company or 911 — NOT a diagnosis, NOT slot offers. This is the single highest-stakes response in the entire product."
echo

# ════════════════════════════════════════════════════════════════════════════
echo "########################################################"
echo "# TEST B — 'Do I have an appointment' query + CANCEL with zero appointments"
echo "########################################################"
PHONEB="+12065550302"
echo "--- fresh number, never booked anything — should decline gracefully, not error ---"
sms "$PHONEB" "Do I have any appointments with you guys?" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEB" "CANCEL" "homeowner" "$CONTRACTOR_ID"
echo ">>> MANUALLY CHECK: both replies should clearly say no appointment/booking found — no crash, no generic error, no false 'cancelled' confirmation."
echo

# ════════════════════════════════════════════════════════════════════════════
echo "########################################################"
echo "# TEST C — Slot-pick variety: ordinal + day-name + explicit date/time replies"
echo "########################################################"
PHONEC="+12065550303"
sms "$PHONEC" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEC" "5555 Birch Ln Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEC" "thermostat isn't turning on the heat" "homeowner" "$CONTRACTOR_ID"
echo "--- reply with an ordinal instead of a bare number ---"
sms "$PHONEC" "the third one" "homeowner" "$CONTRACTOR_ID"
echo ">>> MANUALLY CHECK: 'the third one' should match the 3rd offered slot and confirm — not fall through to a generic re-prompt."
echo

# ════════════════════════════════════════════════════════════════════════════
echo "########################################################"
echo "# TEST D — Inter-appointment travel buffer (task #107)"
echo "# Book a slot, then have a SECOND homeowner try to book the same day —"
echo "# the hour immediately before/after the first booking should disappear."
echo "########################################################"
PHONED1="+12065550304"
PHONED2="+12065550305"
sms "$PHONED1" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONED1" "7777 Cedar Ave Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONED1" "AC not cooling at all" "homeowner" "$CONTRACTOR_ID"
echo "--- book whatever slot #1 is ---"
D1_CONFIRM=$(sms "$PHONED1" "1" "homeowner" "$CONTRACTOR_ID")
echo "$D1_CONFIRM"
sms "$PHONED1" "SKIP" "homeowner" "$CONTRACTOR_ID"
echo "--- second independent homeowner asks what's open the SAME day ---"
sms "$PHONED2" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONED2" "8888 Pine St Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONED2" "furnace making a banging noise" "homeowner" "$CONTRACTOR_ID"
echo ">>> MANUALLY CHECK: compare the slots offered to Phone D2 against Phone D1's confirmed time above — the hour immediately before AND after D1's booking should be missing from D2's offered slots (task #107's 1-hour buffer)."
echo

# ════════════════════════════════════════════════════════════════════════════
echo "########################################################"
echo "# TEST E — max_appointments_per_day cap (task #31)"
echo "# Temporarily sets AirGanic's daily cap to 1, confirms a 2nd same-day booking"
echo "# is correctly refused/pushed to another day, then restores the original value."
echo "########################################################"
ORIGINAL_MAX=$(curl -s -X GET "$BASE/api/contractors/$CONTRACTOR_ID" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('max_appointments_per_day', ''))
except Exception:
    print('')
")
echo "Original max_appointments_per_day: '$ORIGINAL_MAX' (will restore this after the test)"

curl -s -X PUT "$BASE/api/contractors/$CONTRACTOR_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"max_appointments_per_day": 1}' > /dev/null
echo "Set max_appointments_per_day = 1 for this test."

PHONEE1="+12065550306"
PHONEE2="+12065550307"
sms "$PHONEE1" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEE1" "111 Elm Ct Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEE1" "heat pump won't turn on" "homeowner" "$CONTRACTOR_ID"
E1_SLOTS=$(sms "$PHONEE1" "" "homeowner" "$CONTRACTOR_ID" 2>/dev/null || true)
sms "$PHONEE1" "1" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEE1" "SKIP" "homeowner" "$CONTRACTOR_ID"
echo "--- second homeowner tries to book the SAME day, cap should now be full ---"
sms "$PHONEE2" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEE2" "222 Fir Rd Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONEE2" "AC leaking water" "homeowner" "$CONTRACTOR_ID"
echo ">>> MANUALLY CHECK: with the cap at 1/day, the day Phone E1 just booked should NOT appear in Phone E2's offered slots at all."

echo "Restoring original max_appointments_per_day ('$ORIGINAL_MAX')..."
if [ -n "$ORIGINAL_MAX" ] && [ "$ORIGINAL_MAX" != "None" ]; then
  curl -s -X PUT "$BASE/api/contractors/$CONTRACTOR_ID" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"max_appointments_per_day\": $ORIGINAL_MAX}" > /dev/null
else
  curl -s -X PUT "$BASE/api/contractors/$CONTRACTOR_ID" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"max_appointments_per_day": null}' > /dev/null
fi
echo "Restored."
echo

# ════════════════════════════════════════════════════════════════════════════
echo "########################################################"
echo "# TEST F — Brain 2 (contractor-side) commands"
echo "# Confirm the calendar-management commands still work — these have not been"
echo "# re-tested since the earlier live phone session."
echo "########################################################"
CONTRACTOR_PHONE=$(curl -s -X GET "$BASE/api/contractors" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
CONTRACTOR_ID = '$CONTRACTOR_ID'
try:
    rows = json.load(sys.stdin)
    match = next((r for r in rows if r.get('id') == CONTRACTOR_ID), None)
    print(match.get('phone', '') if match else '')
except Exception:
    print('')
")

if [ -z "$CONTRACTOR_PHONE" ]; then
  echo "Could not find AirGanic's phone number via /api/contractors — skipping Test F. Check the admin dashboard manually."
else
  echo "Using AirGanic's real contractor phone: $CONTRACTOR_PHONE"
  sms "$CONTRACTOR_PHONE" "what's on my calendar tomorrow" "contractor" "$CONTRACTOR_ID"
  echo "--- block a window, then re-check via homeowner side that it's actually gone ---"
  sms "$CONTRACTOR_PHONE" "block Thursday 1pm to 4pm" "contractor" "$CONTRACTOR_ID"
  PHONEF="+12065550308"
  sms "$PHONEF" "hello" "homeowner" "$CONTRACTOR_ID"
  sms "$PHONEF" "999 Spruce Way Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
  sms "$PHONEF" "what do you have on Thursday" "homeowner" "$CONTRACTOR_ID"
  echo ">>> MANUALLY CHECK: the calendar query reply should be accurate for tomorrow's real schedule, and Thursday 1-4pm should NOT appear anywhere in the homeowner-side Thursday slots above (the block should have actually taken effect)."
fi
echo

echo "########################################################"
echo "# SANITY CHECK — appointment counts (relevant to the 5-job trigger you're about to build)"
echo "########################################################"
curl -s -X GET "$BASE/api/bookings" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
CONTRACTOR_ID = '$CONTRACTOR_ID'
try:
    rows = json.load(sys.stdin)
    mine = [r for r in rows if r.get('contractor_id') == CONTRACTOR_ID]
    from collections import Counter
    c = Counter(r.get('status') for r in mine)
    print('Total appointments for AirGanic:', len(mine))
    print('By status:', dict(c))
except Exception as e:
    print('Could not parse /api/bookings response — check manually in the admin dashboard. Error:', e)
"
echo ">>> IMPORTANT: everything counted above includes all the test/simulator bookings from this and prior sessions. Before the 5-job-or-21-day trigger goes live for real, clean these out in the admin dashboard (Appointments tab) so simulator noise never counts toward a real contractor's trial."
echo
echo "== Done. =="
