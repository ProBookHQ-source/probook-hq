#!/bin/bash
# Run this AFTER manually backdating the homeowner_sms_sessions row via Railway's
# Data/Query tab. Fires the same reply the stale session would receive and shows
# whether it correctly resumes the appointment context or silently resets.

set -e
BASE="https://tractifyhq.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-ayc98223@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Manufacturing100}"
CONTRACTOR_ID="83616d26-bf60-4ecb-8b9c-17159cff42a7"
PHONE="+12065550399"

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
echo "# Sending the follow-up reply to the now-25-hours-stale"
echo "# awaiting_email session. Watch the reply + sessionState below."
echo "########################################################"
curl -s -X POST "$BASE/api/twilio/test-sms" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"message\":\"actually go ahead and send it to test@example.com\",\"role\":\"homeowner\",\"contractorId\":\"$CONTRACTOR_ID\"}"
echo
echo
echo ">>> CHECK: does the reply reference the appointment/email context at all,"
echo ">>> or does it read like a brand-new 'still at [address]?' / 'what's your"
echo ">>> name and address' greeting with a NEW sessionId? The latter = the"
echo ">>> 24-hour staleness window is resetting the session instead of resuming it."
