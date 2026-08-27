#!/usr/bin/env bash
# Production store ship. Default is both platforms from this git SHA.
#   pnpm ship:production              # iOS + Android (in sync)
#   pnpm ship:production:ios          # TestFlight only
#   pnpm ship:production:android      # Play only
# Marketing version stays lockstep when you ship both. Native integers stay independent.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PLATFORM="${1:-all}"
case "$PLATFORM" in
  all|ios|android) ;;
  *)
    echo "Usage: $0 [all|ios|android]" >&2
    exit 2
    ;;
esac

SHA="$(git -C "$ROOT/../.." rev-parse --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "=== Production ship ($PLATFORM) ==="
echo "  git SHA:             $SHA"
echo "  marketing version:   EAS remote"
echo "  native build numbers: independent auto-increments"
echo ""

pnpm preflight

npx eas-cli build -p "$PLATFORM" --profile production --auto-submit --non-interactive
