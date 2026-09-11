#!/bin/bash
# Combined runner for both "silent reset with zero acknowledgment" fix tests:
#   Test A — stale awaiting_email session (24hr window) after a real booking
#   Test B — stale awaiting_slot session (30min window) mid CANCEL-rebook
#
# This just chains the 4 existing scripts (test-session-resumption.sh,
# test-session-resumption-followup.sh, test-rebook-interruption.sh,
# test-rebook-interruption-followup.sh) into one prompt, pausing where you
# need to run the Railway Data/Query backdate SQL by hand in between.
#
# Usage:
#   chmod +x run-all-resumption-tests.sh
#   ./run-all-resumption-tests.sh

set -e
cd "$(dirname "$0")"

BASE="https://tractifyhq.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-ayc98223@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Manufacturing100}"
CONTRACTOR_ID="83616d26-bf60-4ecb-8b9c-17159cff42a7"
PHONE_A="+12065550399"
PHONE_B="+12065550412"

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
echo "════════════════════════════════════════════════════════════"
echo "TEST A — STEP 1: booking a fresh appointment, stopping at"
echo "the 'want a confirmation email?' prompt (awaiting_email)."
echo "════════════════════════════════════════════════════════════"
sms "$PHONE_A" "hello" "homeowner"
sms "$PHONE_A" "555 Test Resumption Ln Arlington WA 98223" "homeowner"
sms "$PHONE_A" "furnace won't turn on" "homeowner"
echo ">>> Note the 3 slots offered — sending '1' now to confirm a booking."
sms "$PHONE_A" "1" "homeowner"
echo ">>> Session should now be in state 'awaiting_email'."

echo
echo "════════════════════════════════════════════════════════════"
echo "TEST A — STEP 2: backdate this session 25 hours in Railway."
echo "Go to Railway → Postgres → Data/Query tab and run:"
echo "════════════════════════════════════════════════════════════"
echo
echo "UPDATE homeowner_sms_sessions SET updated_at = NOW() - INTERVAL '25 hours' WHERE phone = '$PHONE_A' AND contractor_id = '$CONTRACTOR_ID' AND state = 'awaiting_email';"
echo
echo "Then verify with:"
echo
echo "SELECT state, updated_at, NOW() - updated_at AS age FROM homeowner_sms_sessions WHERE phone = '$PHONE_A' AND contractor_id = '$CONTRACTOR_ID' ORDER BY updated_at DESC LIMIT 1;"
echo
read -p "Press Enter once the backdate is confirmed to continue to Test A follow-up... " _

echo
echo "════════════════════════════════════════════════════════════"
echo "TEST A — STEP 3: follow-up reply, 25 (simulated) hours later."
echo "════════════════════════════════════════════════════════════"
sms "$PHONE_A" "actually go ahead and send it to test@example.com" "homeowner"
echo ">>> PASS = references the existing appointment/address instead of"
echo ">>> resetting to 'what's your name and address?' from scratch."

echo
echo "════════════════════════════════════════════════════════════"
echo "TEST B — STEP 1: mid-rebook, stopping in awaiting_slot with"
echo "real address + service captured, 3 slots offered, no pick."
echo "════════════════════════════════════════════════════════════"
sms "$PHONE_B" "hello" "homeowner"
sms "$PHONE_B" "789 Interruption Way Arlington WA 98223" "homeowner"
sms "$PHONE_B" "water heater is leaking everywhere" "homeowner"
echo ">>> Session should now be in state 'awaiting_slot' with 3 slots offered."
echo ">>> Deliberately NOT picking one."

echo
echo "════════════════════════════════════════════════════════════"
echo "TEST B — STEP 2: backdate this session 35 minutes in Railway."
echo "Go to Railway → Postgres → Data/Query tab and run:"
echo "════════════════════════════════════════════════════════════"
echo
echo "UPDATE homeowner_sms_sessions SET updated_at = NOW() - INTERVAL '35 minutes' WHERE phone = '$PHONE_B' AND contractor_id = '$CONTRACTOR_ID' AND state = 'awaiting_slot';"
echo
echo "Then verify with:"
echo
echo "SELECT state, address, service_description, updated_at, NOW() - updated_at AS age FROM homeowner_sms_sessions WHERE phone = '$PHONE_B' AND contractor_id = '$CONTRACTOR_ID' ORDER BY updated_at DESC LIMIT 1;"
echo
read -p "Press Enter once the backdate is confirmed to continue to Test B follow-up... " _

echo
echo "════════════════════════════════════════════════════════════"
echo "TEST B — STEP 3: follow-up reply, 35 (simulated) minutes later."
echo "════════════════════════════════════════════════════════════"
sms "$PHONE_B" "hey still there?" "homeowner"
echo ">>> PASS = mentions '789 Interruption Way' and 'water heater' with"
echo ">>> fresh slots offered, NOT a blank name/address restart."

echo
echo "════════════════════════════════════════════════════════════"
echo "DONE. Report both replies back — PASS/FAIL on Test A and Test B."
echo "════════════════════════════════════════════════════════════"
