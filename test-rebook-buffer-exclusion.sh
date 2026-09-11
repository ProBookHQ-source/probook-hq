#!/bin/bash
# Tests whether a CANCEL-triggered rebook session respects the same
# inter-appointment travel buffer (task #107) and accumulated-weekday
# exclusion (task #105) that a fresh booking session gets.
#
# Pure simulator test — no real phone, no waiting, no DB access needed.
#
# Usage:
#   chmod +x test-rebook-buffer-exclusion.sh
#   ./test-rebook-buffer-exclusion.sh

set -e
BASE="https://tractifyhq.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-ayc98223@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Manufacturing100}"
CONTRACTOR_ID="83616d26-bf60-4ecb-8b9c-17159cff42a7"

echo "== Logging in as admin =="
TOKEN=$(curl -s -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for k in ['token','accessToken','jwt','access_token']:
        if k in d: print(d[k]); break
except Exception: pass
")
if [ -z "$TOKEN" ]; then echo "Login failed."; exit 1; fi
echo "Got token."

sms() {
  local phone="$1" msg="$2" role="$3"
  curl -s -X POST "$BASE/api/twilio/test-sms" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"phone\":\"$phone\",\"message\":\"$msg\",\"role\":\"$role\",\"contractorId\":\"$CONTRACTOR_ID\"}"
  echo
}

echo
echo "########################################################"
echo "# STEP 1 — Homeowner A books a real appointment (this becomes"
echo "# the 'existing booking' that the buffer needs to protect)"
echo "########################################################"
PHONE_A="+12065550301"
sms "$PHONE_A" "hello" "homeowner"
sms "$PHONE_A" "1234 Maple Ave Arlington WA 98223" "homeowner"
sms "$PHONE_A" "AC is making a grinding noise" "homeowner"
echo ">>> Note the 3 slots offered above. Pick one — sending '1' now."
sms "$PHONE_A" "1" "homeowner"
sms "$PHONE_A" "SKIP" "homeowner"
echo ">>> Homeowner A is now CONFIRMED for whatever slot '1' was."

echo
echo "########################################################"
echo "# STEP 2 — Homeowner A declines a day via CANCEL, forcing a rebook,"
echo "# then declines the FIRST rebook day too (builds excluded_weekdays)"
echo "########################################################"
sms "$PHONE_A" "CANCEL" "homeowner"
echo ">>> Rebook offer just came back above — note which weekday(s) it offered."
sms "$PHONE_A" "none of those work" "homeowner"
echo ">>> This SHOULD exclude the previously-offered weekday and offer a genuinely different day."
echo ">>> MANUALLY CHECK: did it actually exclude the day, or hand back something already declined?"

echo
echo "########################################################"
echo "# STEP 3 — Homeowner B asks about the SAME contractor, same-ish day,"
echo "# to see if the buffer around Homeowner A's real remaining booking holds"
echo "########################################################"
PHONE_B="+12065550302"
sms "$PHONE_B" "hello" "homeowner"
sms "$PHONE_B" "9999 Oak St Arlington WA 98223" "homeowner"
sms "$PHONE_B" "furnace is dead" "homeowner"
echo ">>> MANUALLY CHECK: do the slots offered to Homeowner B correctly skip"
echo ">>> the 1-hour buffer around whatever Homeowner A currently has booked?"
echo ">>> (Compare against Homeowner A's final confirmed/rebooked time above.)"

echo
echo "== Done. This test is fully deterministic via the simulator — no phone, no waiting. =="
echo "== If either MANUALLY CHECK above fails, that's a real, previously-unverified bug in"
echo "== the CANCEL-rebook path (task #105/#107 interaction) — flag it, don't just note it. =="
