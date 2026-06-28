#!/usr/bin/env bash
# Full end-to-end test of /api/doz/project-vendors in one shot.
# The dev server dies between bash sessions, so this script starts the server,
# waits for it, runs auth + all tests, and tears down — all in one process tree.

cd /home/z/my-project
mkdir -p .tmp

# 1. Start fresh dev server.
pkill -f "next dev" 2>/dev/null || true
sleep 1
setsid bash -c 'node node_modules/.bin/next dev -p 3000 > dev.log 2>&1' < /dev/null &
echo "[1/8] Started dev server, waiting 22s for ready..."
sleep 22

# 2. Sanity check.
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ -m 15)
echo "[2/8] Server HTTP check: $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: server not ready"
  pkill -f "next dev" 2>/dev/null || true
  exit 1
fi

# 3. Auth: CSRF + login.
CSRF=$(curl -s -c .tmp/c.txt http://localhost:3000/api/auth/csrf -m 15 | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
curl -s -i -b .tmp/c.txt -X POST "http://localhost:3000/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "email=founder@digitonezero.com&password=doz2025&csrfToken=$CSRF&callbackUrl=http://localhost:3000/api/auth/session&json=true" \
  -m 20 2>&1 | grep -i "set-cookie: next-auth.session-token" | sed 's/.*next-auth.session-token=//;s/;.*//' > .tmp/token.txt
TOKEN=$(cat .tmp/token.txt)
echo "[3/8] Authenticated. Token len: ${#TOKEN}"

# 4. 401 without cookie.
NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/doz/project-vendors?projectId=cmqy7pb3h0038pv9ijv1c3tsx" -m 10)
echo "[4/8] 401 without cookie: $NO_AUTH (expected 401)"

# 5. GET seeded vendor costs for MTN project.
echo "[5/8] GET seeded vendor costs:"
curl -s -H "Cookie: next-auth.session-token=$TOKEN" "http://localhost:3000/api/doz/project-vendors?projectId=cmqy7pb3h0038pv9ijv1c3tsx" -m 15 > .tmp/get1.json
python3 -c "
import json
d = json.load(open('.tmp/get1.json'))
print('  vendorCosts:')
for c in d['vendorCosts']:
    print(f\"    - {c['vendorName']} | {c['item']} | fee={c['fee']} paid={c['amountPaid']} bal={c['balance']} status={c['status']}\")
print('  summary:', d['summary'])
"

# 6. POST: add a new vendor cost (manual vendor name).
echo "[6/8] POST: add new vendor cost (manual vendor name):"
POST_RES=$(curl -s -X POST -H "Cookie: next-auth.session-token=$TOKEN" -H "Content-Type: application/json" \
  "http://localhost:3000/api/doz/project-vendors" \
  --data '{"projectId":"cmqy7pb3h0038pv9ijv1c3tsx","vendorName":"Test Vendor Co","item":"LED Screen 6x4m","fee":1500000,"amountPaid":500000,"notes":"50% advance paid"}' \
  -m 15)
echo "$POST_RES" | python3 -m json.tool
NEW_ID=$(echo "$POST_RES" | python3 -c 'import sys,json;print(json.load(sys.stdin)["vendorCost"]["id"])')
echo "  Created ID: $NEW_ID"

# 7. PATCH: bump amountPaid to mark fully paid.
echo "[7/8] PATCH: update amountPaid=1500000 + notes"
curl -s -X PATCH -H "Cookie: next-auth.session-token=$TOKEN" -H "Content-Type: application/json" \
  "http://localhost:3000/api/doz/project-vendors" \
  --data "{\"costId\":\"$NEW_ID\",\"amountPaid\":1500000,\"notes\":\"Fully paid - final settlement\"}" \
  -m 15 | python3 -m json.tool

# 8. GET again to verify update + summary reflects the new total.
echo "[8/8] GET (verify update reflected):"
curl -s -H "Cookie: next-auth.session-token=$TOKEN" "http://localhost:3000/api/doz/project-vendors?projectId=cmqy7pb3h0038pv9ijv1c3tsx" -m 15 > .tmp/get2.json
python3 -c "
import json
d = json.load(open('.tmp/get2.json'))
for c in d['vendorCosts']:
    if c['id'] == '$NEW_ID':
        print(f\"  Updated row: {c['vendorName']} | {c['item']} | fee={c['fee']} paid={c['amountPaid']} bal={c['balance']} status={c['status']} notes={c['notes']}\")
print('  Updated summary:', d['summary'])
"

# 9. POST with vendorId (pick existing vendor).
echo "[9/x] POST: with vendorId (existing vendor):"
VENDOR_PAYLOAD=$(curl -s -H "Cookie: next-auth.session-token=$TOKEN" "http://localhost:3000/api/doz/vendors" -m 15)
VENDOR_ID=$(echo "$VENDOR_PAYLOAD" | python3 -c 'import sys,json;print(json.load(sys.stdin)["vendors"][0]["id"])')
echo "  Using vendorId: $VENDOR_ID"
POST2_RES=$(curl -s -X POST -H "Cookie: next-auth.session-token=$TOKEN" -H "Content-Type: application/json" \
  "http://localhost:3000/api/doz/project-vendors" \
  --data "{\"projectId\":\"cmqy7pb3h0038pv9ijv1c3tsx\",\"vendorId\":\"$VENDOR_ID\",\"item\":\"Test by vendorId\",\"fee\":100000,\"amountPaid\":0}" \
  -m 15)
echo "$POST2_RES" | python3 -m json.tool
NEW_ID2=$(echo "$POST2_RES" | python3 -c 'import sys,json;print(json.load(sys.stdin)["vendorCost"]["id"])')

# 10. Validation test: missing item should return 400.
echo "[10/x] POST: validation (missing item, expect 400):"
curl -s -X POST -H "Cookie: next-auth.session-token=$TOKEN" -H "Content-Type: application/json" \
  "http://localhost:3000/api/doz/project-vendors" \
  --data '{"projectId":"cmqy7pb3h0038pv9ijv1c3tsx","vendorName":"Bad","fee":100}' \
  -w "\n  HTTP %{http_code}\n" -m 15

# 11. DELETE both test rows.
echo "[11/x] DELETE: clean up the two test rows"
curl -s -X DELETE -H "Cookie: next-auth.session-token=$TOKEN" -H "Content-Type: application/json" \
  "http://localhost:3000/api/doz/project-vendors" --data "{\"costId\":\"$NEW_ID\"}" -m 15
echo ""
curl -s -X DELETE -H "Cookie: next-auth.session-token=$TOKEN" -H "Content-Type: application/json" \
  "http://localhost:3000/api/doz/project-vendors" --data "{\"costId\":\"$NEW_ID2\"}" -m 15
echo ""

# 12. Final GET — back to the seeded 3 rows.
echo "[12/x] Final GET (should be back to 3 seeded rows):"
curl -s -H "Cookie: next-auth.session-token=$TOKEN" "http://localhost:3000/api/doz/project-vendors?projectId=cmqy7pb3h0038pv9ijv1c3tsx" -m 15 > .tmp/get3.json
python3 -c "
import json
d = json.load(open('.tmp/get3.json'))
print(f\"  count: {len(d['vendorCosts'])} (expected 3)\")
print('  summary:', d['summary'])
"

echo ""
echo "=== ALL TESTS COMPLETE ==="

# Stop the dev server (we'll let the system restart it).
pkill -f "next dev" 2>/dev/null || true
sleep 1
