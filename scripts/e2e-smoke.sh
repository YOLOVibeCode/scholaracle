#!/usr/bin/env bash
# E2E smoke test: register -> add student -> trigger alert -> verify email in Mailpit.
# Requires: curl, jq. Start API (with SMTP_HOST=localhost SMTP_PORT=2803) and Mailpit (port 2804) first.
set -e

API_BASE="${API_BASE:-http://localhost:2801}"
MAILPIT_UI="${MAILPIT_UI:-http://localhost:2804}"
PARENT_EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="SmokePass123!"

echo "=== E2E Smoke: API=$API_BASE Mailpit=$MAILPIT_UI ==="

# 1. Register
echo "1. Register..."
REG=$(curl -s -X POST "$API_BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$PARENT_EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke User\",\"rememberMe\":true}")
if ! echo "$REG" | jq -e '.token' >/dev/null 2>&1; then
  echo "Register failed: $REG"
  exit 1
fi
TOKEN=$(echo "$REG" | jq -r '.token')
echo "   Register OK (token received)"

# 2. Add student
echo "2. Add student..."
STU=$(curl -s -X POST "$API_BASE/api/students" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Student","grade":9}')
if ! echo "$STU" | jq -e '.id' >/dev/null 2>&1; then
  echo "Add student failed: $STU"
  exit 1
fi
STUDENT_ID=$(echo "$STU" | jq -r '.id')
echo "   Add student OK (id=$STUDENT_ID)"

# 3. POST alert (sends email to PARENT_EMAIL via Mailpit when SMTP_HOST is set)
echo "3. POST alert..."
ALERT=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/alerts" \
  -H "Content-Type: application/json" \
  -d "{\"studentId\":\"$STUDENT_ID\",\"type\":\"grade_drop\",\"severity\":\"critical\",\"userId\":\"$PARENT_EMAIL\",\"relatedData\":{\"courseName\":\"Math\",\"previousGrade\":92,\"currentGrade\":85}}")
HTTP_CODE=$(echo "$ALERT" | tail -n1)
BODY=$(echo "$ALERT" | sed '$d')
if [ "$HTTP_CODE" != "201" ]; then
  echo "POST alert failed (HTTP $HTTP_CODE): $BODY"
  exit 1
fi
echo "   POST alert OK (201)"

# 4. Verify Mailpit received the email
echo "4. Check Mailpit for email..."
sleep 2
RESP=$(curl -s "$MAILPIT_UI/api/v1/messages")
# API returns { total, messages: [...] } or { messages: [...] }
COUNT=$(echo "$RESP" | jq '.total // (.messages | length) // 0')
if [ "$COUNT" -lt 1 ]; then
  echo "   No messages in Mailpit (is SMTP_HOST set and Mailpit running?)"
  echo "   Response: $RESP"
  exit 1
fi
echo "   Mailpit has $COUNT message(s)"

echo "=== Smoke test passed ==="
