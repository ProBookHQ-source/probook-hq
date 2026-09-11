#!/bin/bash
# Tests whether a stale awaiting_email session (24-hour resumption window)
# correctly resumes with the right appointment context instead of resetting.
#
# This is the overnight test set up Sept 6->7 that never got confirmed as
# actually checked. Instead of waiting ~24 real hours, this backdates the
# session's updated_at via direct DB access so the staleness logic gets
# exercised for real, right now.
#
# Requires Railway CLI logged in and linked to the project
# (railway login / railway link), since this needs direct psql access —
# there's no admin API that exposes homeowner_sms_sessions rows.
#
# Usage:
#   chmod +x test-session-resumption.sh
#   ./test-session-resumption.sh

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
echo "# STEP 1 — Book a fresh appointment, then stop right at the"
echo "# 'want a confirmation email? Reply with your email or SKIP'"
echo "# prompt (awaiting_email) WITHOUT replying — this is the exact"
echo "# state the 24-hour staleness window applies to."
echo "########################################################"
sms "$PHONE" "hello" "homeowner"
sms "$PHONE" "555 Test Resumption Ln Arlington WA 98223" "homeowner"
sms "$PHONE" "furnace won't turn on" "homeowner"
echo ">>> Note the 3 slots offered — sending '1' now to confirm a booking."
sms "$PHONE" "1" "homeowner"
echo ">>> Session should now be in state 'awaiting_email'. Deliberately NOT replying yet."

echo
echo "########################################################"
echo "# STEP 2 — Backdate this session's updated_at to 25 hours ago"
echo "# via direct Railway psql access, so the 24-hour staleness"
echo "# window actually applies on the next message."
echo "########################################################"
echo ">>> Requires: railway CLI installed + logged in + linked to this project."
echo ">>> Run this manually if the automated command below fails:"
echo ""
echo "railway run psql \$DATABASE_URL -c \"UPDATE homeowner_sms_sessions SET updated_at = NOW() - INTERVAL '25 hours' WHERE phone = '$PHONE' AND contractor_id = '$CONTRACTOR_ID' AND state = 'awaiting_email';\""
echo ""
read -p "Press Enter once you've run the backdate command above (or let this script try it now)... " _
railway run psql "\$DATABASE_URL" -c "UPDATE homeowner_sms_sessions SET updated_at = NOW() - INTERVAL '25 hours' WHERE phone = '$PHONE' AND contractor_id = '$CONTRACTOR_ID' AND state = 'awaiting_email';" || echo ">>> Automated backdate failed or was skipped — run the command above manually before continuing."

echo
echo "########################################################"
echo "# STEP 3 — Reply now, 25 (simulated) hours later. Does it:"
echo "#   (a) correctly recognize the appointment context and either"
echo "#       resume asking for the email or gracefully acknowledge"
echo "#       the booking already happened, OR"
echo "#   (b) silently reset to the generic 'still at [address]?' greeting,"
echo "#       discarding the appointment context entirely?"
echo "########################################################"
sms "$PHONE" "actually go ahead and send it to test@example.com" "homeowner"
echo ">>> MANUALLY CHECK the reply above against (a) vs (b)."
echo ">>> If (b) — that's a real, previously-unverified bug: awaiting_email's"
echo ">>> 24-hour window is NOT actually being honored, or resumption logic"
echo ">>> doesn't correctly reconnect to the appointment once resumed."

echo
echo "== Done. Note: this MUST use direct DB access to backdate updated_at —"
echo "== there is no way to validate real 24-hour resumption behavior by"
echo "== firing messages back-to-back with no time actually elapsed. =="
