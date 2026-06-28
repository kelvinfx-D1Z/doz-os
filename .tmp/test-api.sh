#!/usr/bin/env bash
# Test script for project-vendors API — start server, auth, exercise endpoints.
set -e
cd /home/z/my-project

# 1. Kill any prior server and start fresh.
pkill -f "next dev" 2>/dev/null || true
sleep 1
setsid bash -c 'node node_modules/.bin/next dev -p 3000 > dev.log 2>&1' < /dev/null &
echo "Waiting for dev server..."
sleep 20

# 2. Verify server is up.
curl -s -o /dev/null -w "Server check: HTTP %{http_code}\n" http://localhost:3000/ -m 15

# 3. Get CSRF + log in.
mkdir -p .tmp
CSRF=$(curl -s -c .tmp/c.txt http://localhost:3000/api/auth/csrf | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
echo "CSRF token: ${CSRF:0:20}..."

curl -s -i -b .tmp/c.txt -X POST "http://localhost:3000/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "email=founder@digitonezero.com&password=doz2025&csrfToken=$CSRF&callbackUrl=http://localhost:3000/api/auth/session&json=true" \
  -m 20 2>&1 | grep -i "set-cookie: next-auth.session-token" | sed 's/.*next-auth.session-token=//;s/;.*//' > .tmp/token.txt

TOKEN=$(cat .tmp/token.txt)
echo "Session token length: ${#TOKEN}"

# 4. Verify session.
echo ""
echo "=== session check ==="
curl -s -H "Cookie: next-auth.session-token=$TOKEN" "http://localhost:3000/api/auth/session" -m 10
echo ""

# 5. Test GET /api/doz/project-vendors?projectId=... (should be 401 unauth without cookie).
echo ""
echo "=== 401 without cookie ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:3000/api/doz/project-vendors?projectId=cmqy7pb3h0038pv9ijv1c3tsx" -m 10

# 6. Test GET with auth — find a real project ID.
echo ""
echo "=== GET projects to find a project ID ==="
PID=$(curl -s -H "Cookie: next-auth.session-token=$TOKEN" "http://localhost:3000/api/doz/projects" -m 15 | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["projects"][0]["id"])')
echo "Using project: $PID"

# 7. GET vendor costs for project.
echo ""
echo "=== GET /api/doz/project-vendors?projectId=$PID ==="
curl -s -H "Cookie: next-auth.session-token=$TOKEN" "http://localhost:3000/api/doz/project-vendors?projectId=$PID" -m 15 | python3 -m json.tool

# 8. POST a new vendor cost (manual vendor name).
echo ""
echo "=== POST vendor cost (manual vendor) ==="
curl -s -X POST -H "Cookie: next-auth.session-token=$TOKEN" -H "Content-Type: application/json" \
  "http://localhost:3000/api/doz/project-vendors" \
  --data "{\"projectId\":\"$PID\",\"vendorName\":\"Test Vendor Co\",\"item\":\"LED Screen 6x4m\",\"fee\":1500000,\"amountPaid\":500000,\"notes\":\"50% advance paid\"}" \
  -m 15 | python3 -m json.tool
