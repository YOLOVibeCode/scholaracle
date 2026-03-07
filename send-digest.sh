#!/bin/bash

# Manual Digest Trigger Script
# Usage: ./send-digest.sh

echo "📧 MANUAL DIGEST TRIGGER"
echo "════════════════════════════════════════"
echo ""

# These need to be filled in:
# 1. Get student ID from database or API
# 2. Get auth token from login

STUDENT_ID="${1:-STUDENT_ID_HERE}"
AUTH_TOKEN="${2:-AUTH_TOKEN_HERE}"
RECIPIENT="${3:-rvegajr@noctusoft.com}"

if [ "$STUDENT_ID" = "STUDENT_ID_HERE" ] || [ "$AUTH_TOKEN" = "AUTH_TOKEN_HERE" ]; then
  echo "❌ Missing credentials"
  echo ""
  echo "Usage: ./send-digest.sh <student_id> <auth_token> [recipient]"
  echo ""
  echo "To get credentials:"
  echo "1. Login to https://app.scholarmancy.com"
  echo "2. Open browser DevTools (F12)"
  echo "3. Go to Application > Local Storage"
  echo "4. Copy the auth token"
  echo ""
  exit 1
fi

echo "Student ID: $STUDENT_ID"
echo "Recipient: $RECIPIENT"
echo ""
echo "🚀 Sending digest..."
echo ""

curl -X POST "https://api.scholarmancy.com/api/students/$STUDENT_ID/send-digest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "{\"recipients\": [\"$RECIPIENT\"]}" \
  -w "\n\nStatus: %{http_code}\n" \
  -s

echo ""
echo "✅ Complete!"
echo ""
echo "Check Railway logs: railway logs --service workers -f"
