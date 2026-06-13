#!/bin/bash
set -e

BASE="https://probook-hq-production.up.railway.app"

echo "🔐 Creating admin account..."
REGISTER=$(curl -s -X POST "$BASE/api/auth/admin/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Jose","email":"ayc98223@gmail.com","password":"Manufacturing100","setupKey":"setup-1234"}')
echo "Register response: $REGISTER"

TOKEN=$(echo "$REGISTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "✅ Admin created"

echo "🔍 Finding Roofing niche..."
NICHE_ID=$(curl -s "$BASE/api/niches" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; niches=json.load(sys.stdin); print(next(n['id'] for n in niches if n['name']=='Roofing'))")
echo "✅ Niche ID: $NICHE_ID"

echo "👷 Creating John Smith..."
RESULT=$(curl -s -X POST "$BASE/api/contractors" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"name\":\"John Smith\",\"email\":\"john@smithroofing.com\",\"password\":\"Contractor123!\",\"company_name\":\"Smith Roofing\",\"niche_id\":\"$NICHE_ID\",\"service_zip_codes\":[\"98223\"],\"phone\":\"555-1234\"}")
echo "✅ Done: $RESULT"
