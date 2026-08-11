#!/usr/bin/env bash
# Self-test for block-secrets.sh (run from repo root).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Create a throwaway file that should be blocked if staged
TMP="packages/mobile/companion.env.local"
cleanup() {
  git reset -q HEAD -- "$TMP" 2>/dev/null || true
  rm -f "$TMP"
}
trap cleanup EXIT

echo "COMPANION_PORTAL_PASSWORD=supersecret" > "$TMP"
git add -f "$TMP" 2>/dev/null || git add "$TMP"

if ./scripts/block-secrets.sh; then
  echo "FAIL: block-secrets.sh allowed a credential file"
  exit 1
fi

echo "PASS: block-secrets.sh rejected companion.env.local"
