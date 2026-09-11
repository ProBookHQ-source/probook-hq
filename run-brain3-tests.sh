#!/bin/bash
# Brain 3 / Brain 2 regression test runner — uses the built-in POST /api/twilio/test-sms
# simulator so you don't have to text every scenario by hand from your real phone.
#
# Usage:
#   chmod +x run-brain3-tests.sh
#   ./run-brain3-tests.sh
#   (admin email/password are already defaulted below to the real current login —
#   override with ADMIN_EMAIL=... ADMIN_PASSWORD=... ./run-brain3-tests.sh if needed)
#
# Contractor is hardcoded to AirGanic (83616d26-bf60-4ecb-8b9c-17159cff42a7) since it's
# currently the only contractor in the system. AirGanic's real service area is zip 98223
# (Arlington, WA) — all in-area test addresses below use that zip. Test 4 (declined-weekday
# + buffer on a TIGHT calendar) is skipped since there's no second, partial-schedule
# contractor to run it against yet — once one exists, pass its ID as $1 to enable that test.

set -e

BASE="https://tractifyhq.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-ayc98223@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Manufacturing100}"
CONTRACTOR_ID="83616d26-bf60-4ecb-8b9c-17159cff42a7"
TIGHT_CONTRACTOR_ID="${1:-}"

echo "== Logging in as admin =="
LOGIN_RESPONSE=$(curl -s -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

echo "Raw login response: $LOGIN_RESPONSE"

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
except Exception as e:
    print('', end='')
    sys.exit(0)
# try common key names the token might be under
for key in ['token', 'accessToken', 'jwt', 'access_token']:
    if key in data:
        print(data[key])
        sys.exit(0)
print('', end='')
")

if [ -z "$TOKEN" ]; then
  echo "Login failed — no token found in response above. Check ADMIN_PASSWORD (or the actual admin password if the doc hint is wrong)."
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

echo
echo "########################################################"
echo "# TEST 1 — CANCEL-triggered rebook vs travel buffer + declined-weekday exclusion"
echo "# (task #107 / #105 interaction, flagged as unverified in the Next Test List)"
echo "########################################################"
PHONE1="+12065550101"
echo "--- Step 1: fresh booking on a wide-open day ---"
sms "$PHONE1" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE1" "1234 Maple Ave Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE1" "AC is making a grinding noise" "homeowner" "$CONTRACTOR_ID"
echo "--- Step 2: pick slot 1, confirm, then decline a day to build excluded_weekdays ---"
sms "$PHONE1" "1" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE1" "SKIP" "homeowner" "$CONTRACTOR_ID"
echo "--- Step 3: text CANCEL to trigger rebook ---"
sms "$PHONE1" "CANCEL" "homeowner" "$CONTRACTOR_ID"
echo "--- Step 4: decline the first rebook day offered, see if excluded_weekdays carries over ---"
sms "$PHONE1" "can't do that day" "homeowner" "$CONTRACTOR_ID"
echo ">>> MANUALLY CHECK: did the rebook session respect the buffer around any existing booking, and did the decline correctly exclude that weekday going forward?"
echo

echo "########################################################"
echo "# TEST 2 — Out-of-scope service request (post scope-check changes)"
echo "########################################################"
PHONE2="+12065550102"
sms "$PHONE2" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE2" "5678 Oak St Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE2" "my kitchen sink is clogged and leaking" "homeowner" "$CONTRACTOR_ID"
echo ">>> MANUALLY CHECK: on an HVAC contractor number, this should be politely declined as out of scope, with NO slots offered."
echo

echo "########################################################"
echo "# TEST 3 — Second independent Restart -> out-of-area -> zip-correction -> booking run"
echo "########################################################"
PHONE3="+12065550103"
sms "$PHONE3" "hello" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE3" "42 Farview Rd Spokane WA 99201" "homeowner" "$CONTRACTOR_ID"
echo "--- expect out_of_area here (99201 is genuinely outside AirGanic's service area), then correct with the REAL in-area zip (98223, Arlington) ---"
sms "$PHONE3" "I meant zip code 98223 but address is the same" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE3" "Restart" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE3" "42 Farview Rd Arlington WA 98223" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE3" "furnace won't turn on" "homeowner" "$CONTRACTOR_ID"
sms "$PHONE3" "1" "homeowner" "$CONTRACTOR_ID"
echo ">>> MANUALLY CHECK: full correct street address (not just zip) reaches the final confirmation and would reach the contractor alert."
echo

if [ -n "$TIGHT_CONTRACTOR_ID" ]; then
  echo "########################################################"
  echo "# TEST 4 — declined-weekday accumulation + inter-appointment buffer on a TIGHT calendar"
  echo "########################################################"
  PHONE4="+12065550104"
  sms "$PHONE4" "hello" "homeowner" "$TIGHT_CONTRACTOR_ID"
  sms "$PHONE4" "99 Narrow Ln Arlington WA 98223" "homeowner" "$TIGHT_CONTRACTOR_ID"
  sms "$PHONE4" "heat pump is making noise" "homeowner" "$TIGHT_CONTRACTOR_ID"
  sms "$PHONE4" "none of those work" "homeowner" "$TIGHT_CONTRACTOR_ID"
  sms "$PHONE4" "none of those work either" "homeowner" "$TIGHT_CONTRACTOR_ID"
  echo ">>> MANUALLY CHECK: does it ever falsely say 'nothing available' on a tight-but-not-empty calendar after 2 declines?"
  echo
else
  echo "(Skipping Test 4 — no second, tighter-calendar contractor exists yet. Pass one as \$1 once you have one: ./run-brain3-tests.sh TIGHT_CONTRACTOR_ID)"
  echo
fi

echo "########################################################"
echo "# TEST 5 — Concurrent homeowners on the same contractor (basic parallel stress test)"
echo "########################################################"
{
  sms "+12065550201" "hello" "homeowner" "$CONTRACTOR_ID" &
  sms "+12065550202" "hello" "homeowner" "$CONTRACTOR_ID" &
  sms "+12065550203" "hello" "homeowner" "$CONTRACTOR_ID" &
  wait
}
echo ">>> MANUALLY CHECK: all three got distinct, correct greeting replies with no cross-talk or dropped messages."
echo

echo "== Done. Review the >>> MANUALLY CHECK lines above against the actual replies printed. =="
