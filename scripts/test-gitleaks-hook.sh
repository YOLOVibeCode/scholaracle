#!/usr/bin/env bash
# Staged Stripe-like key must fail block-secrets.sh when gitleaks is on PATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "SKIP: gitleaks not installed (install CLI to run this test)"
  exit 0
fi

TMP="gitleaks-hook-selftest.txt"
cleanup() {
  git reset -q HEAD -- "$TMP" 2>/dev/null || true
  rm -f "$TMP"
}
trap cleanup EXIT

# Write a Stripe-shaped key via printf so this script is not a gitleaks hit itself.
printf 'export STRIPE_KEY="%s%s%s%s"\n' sk_ live_ test 1234567890123456789012 > "$TMP"
git add "$TMP"

if ./scripts/block-secrets.sh; then
  echo "FAIL: block-secrets.sh allowed a staged Stripe-like key"
  exit 1
fi

echo "PASS: block-secrets.sh rejected staged secret via gitleaks"
