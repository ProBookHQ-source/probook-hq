#!/bin/bash
# Tests the OTHER half of the "silent reset with zero acknowledgment" fix —
# a homeowner mid-rebook (real address + service already captured, fresh
# slots already offered) who goes quiet past the 30-minute awaiting_slot
# staleness window. Before the fix: next message got the exact same blank
# "what's your name and the address that needs service?" greeting as a total
# stranger. After the fix: should get a "picking this back up for [service]
# at [address]" bridge message with a freshly-refetched slot list.
#
# Same two-script pattern as test-session-resumption.sh /
# test-session-resumption-followup.sh — this script gets the session INTO
# awaiting_slot, then you manually backdate it via Railway's Postgres
# Data/Query tab, then run test-rebook-interruption-followup.sh.
#
# Usage:
#   chmod +x test-rebook-interruption.sh
#   ./test-rebook-interruption.sh

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
echo "# STEP 1 — Get the session into awaiting_slot (real address +"
echo "# real service captured, 3 slots offered) and then STOP — do"
echo "# NOT pick a slot. This is the exact state the 30-minute"
echo "# pre-commitment staleness window applies to."
echo "########################################################"
sms "$PHONE" "hello" "homeowner"
sms "$PHONE" "789 Interruption Way Arlington WA 98223" "homeowner"
sms "$PHONE" "water heater is leaking everywhere" "homeowner"
echo ">>> Session should now be in state 'awaiting_slot' with 3 slots offered."
echo ">>> Deliberately NOT picking one."

echo
echo "########################################################"
echo "# STEP 2 — Backdate this session's updated_at to 35 minutes ago"
echo "# via Railway's Postgres Data/Query tab (same tool used for the"
echo "# awaiting_email test earlier this session)."
echo "########################################################"
echo ""
echo "Run this in Railway's Data/Query tab:"
echo ""
echo "UPDATE homeowner_sms_sessions SET updated_at = NOW() - INTERVAL '35 minutes' WHERE phone = '$PHONE' AND contractor_id = '$CONTRACTOR_ID' AND state = 'awaiting_slot';"
echo ""
echo "Then verify it took with:"
echo ""
echo "SELECT state, address, service_description, updated_at, NOW() - updated_at AS age FROM homeowner_sms_sessions WHERE phone = '$PHONE' AND contractor_id = '$CONTRACTOR_ID' ORDER BY updated_at DESC LIMIT 1;"
echo ""
echo "Once confirmed, run test-rebook-interruption-followup.sh"
