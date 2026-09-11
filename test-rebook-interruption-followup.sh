#!/bin/bash
# Run this AFTER manually backdating the awaiting_slot session's updated_at
# via Railway's Data/Query tab (see test-rebook-interruption.sh Step 2).
# Fires a follow-up text and shows whether the fix is holding: it should
# reference "789 Interruption Way" and "water heater" and offer fresh slots,
# NOT ask "what's your name and the address that needs service?" from scratch.

set -e
BASE="https://tractifyhq.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-ayc98223@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Manufacturing100}"
CONTRACTOR_ID="83616d26-bf60-4ecb-8b9c-17159cff42a7"
PHONE="+12065550412"

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

echo
echo "########################################################"
echo "# Sending a follow-up reply to the now-35-minutes-stale"
echo "# awaiting_slot session. Watch the reply below."
echo "########################################################"
curl -s -X POST "$BASE/api/twilio/test-sms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"message\":\"hey still there?\",\"role\":\"homeowner\",\"contractorId\":\"$CONTRACTOR_ID\"}"
echo
echo
echo ">>> PASS = reply says something like \"picking this back up for water heater"
echo ">>> is leaking everywhere at 789 Interruption Way\" with fresh slots offered."
echo ">>> FAIL = reply is the generic \"what's your name and the address that needs"
echo ">>> service?\" greeting, discarding everything already given."
