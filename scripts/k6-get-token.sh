#!/usr/bin/env bash
# Mint a parent JWT for k6 smoke tests. Source: source ./scripts/k6-get-token.sh
set -euo pipefail
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:2801/api}"
EMAIL="${K6_PARENT_EMAIL:-test.parent@example.com}"
PASSWORD="${K6_PARENT_PASSWORD:-TestPass123!}"
RESP="$(curl -fsS -X POST "${API_BASE_URL}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"
export K6_PARENT_TOKEN="$(printf '%s' "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);if(!j.token){process.exit(1)};process.stdout.write(j.token)})")"
echo "K6_PARENT_TOKEN exported (${#K6_PARENT_TOKEN} chars)"
