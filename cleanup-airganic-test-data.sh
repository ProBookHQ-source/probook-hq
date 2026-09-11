#!/bin/bash
# Wipes all test/simulator appointments + leads created against AirGanic during
# regression testing, so the real 5-job-or-21-day trial trigger starts counting
# from zero once it's built. Safe to re-run — anything already gone is skipped.
#
# Usage:
#   chmod +x cleanup-airganic-test-data.sh
#   ./cleanup-airganic-test-data.sh          # dry run — shows what WOULD be deleted
#   ./cleanup-airganic-test-data.sh --apply  # actually deletes it

set -e

BASE="https://tractifyhq.com"
ADMIN_EMAIL="${ADMIN_EMAIL:-ayc98223@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Manufacturing100}"
CONTRACTOR_ID="83616d26-bf60-4ecb-8b9c-17159cff42a7"
APPLY="${1:-}"

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
echo "== Fetching all appointments for AirGanic =="
curl -s -X GET "$BASE/api/bookings" -H "Authorization: Bearer $TOKEN" > /tmp/all_bookings.json
python3 -c "
import json
CID = '$CONTRACTOR_ID'
rows = json.load(open('/tmp/all_bookings.json'))
mine = [r for r in rows if r.get('contractor_id') == CID]
with_lead = [r for r in mine if r.get('lead_id')]
without_lead = [r for r in mine if not r.get('lead_id')]
print(f'Total appointments for AirGanic: {len(mine)}')
print(f'  -> {len(with_lead)} have a lead (will delete via lead cascade)')
print(f'  -> {len(without_lead)} are direct bookings, no lead (will delete appointment directly)')
json.dump([r['lead_id'] for r in with_lead], open('/tmp/lead_ids.json','w'))
json.dump([r['id'] for r in without_lead], open('/tmp/appt_ids_no_lead.json','w'))
"

echo
echo "== Fetching all leads assigned to AirGanic (includes ones with no appointment at all) =="
curl -s -X GET "$BASE/api/leads" -H "Authorization: Bearer $TOKEN" > /tmp/all_leads.json
python3 -c "
import json
CID = '$CONTRACTOR_ID'
rows = json.load(open('/tmp/all_leads.json'))
mine = [r['id'] for r in rows if r.get('assigned_contractor_id') == CID]
existing = set(json.load(open('/tmp/lead_ids.json')))
extra = [l for l in mine if l not in existing]
all_leads = list(existing) + extra
print(f'Leads directly assigned to AirGanic: {len(mine)} total, {len(extra)} not already covered above')
json.dump(all_leads, open('/tmp/all_lead_ids_to_delete.json','w'))
"

LEAD_IDS=$(python3 -c "import json; print(' '.join(json.load(open('/tmp/all_lead_ids_to_delete.json'))))")
APPT_IDS=$(python3 -c "import json; print(' '.join(json.load(open('/tmp/appt_ids_no_lead.json'))))")

if [ "$APPLY" != "--apply" ]; then
  echo
  echo "== DRY RUN — nothing deleted. Re-run with --apply to actually delete. =="
  echo "Would delete leads (cascades their appointments + tokens): $LEAD_IDS"
  echo "Would delete direct-booking appointments (no lead): $APPT_IDS"
  exit 0
fi

echo
echo "== Deleting leads (cascades appointments + booking tokens) =="
for id in $LEAD_IDS; do
  RESULT=$(curl -s -X DELETE "$BASE/api/leads/$id" -H "Authorization: Bearer $TOKEN")
  echo "  $id -> $RESULT"
done

echo
echo "== Deleting direct-booking appointments (no lead attached) =="
for id in $APPT_IDS; do
  RESULT=$(curl -s -X DELETE "$BASE/api/bookings/$id" -H "Authorization: Bearer $TOKEN")
  echo "  $id -> $RESULT"
done

echo
echo "== Verifying — should be 0 now =="
curl -s -X GET "$BASE/api/bookings" -H "Authorization: Bearer $TOKEN" | python3 -c "
import json
CID = '$CONTRACTOR_ID'
rows = json.load(__import__('sys').stdin)
mine = [r for r in rows if r.get('contractor_id') == CID]
print(f'Remaining appointments for AirGanic: {len(mine)}')
"
echo
echo "== Done. Note: this does NOT clean up homeowner_sms_sessions rows (no admin API exposes them) —"
echo "   those are harmless leftovers and will just age out / get superseded by real future sessions. =="
