#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export LHCI_PARENT_EMAIL="${LHCI_PARENT_EMAIL:-test.parent@example.com}"
export LHCI_PARENT_PASSWORD="${LHCI_PARENT_PASSWORD:-TestPass123!}"
export LHCI_API_BASE_URL="${LHCI_API_BASE_URL:-http://127.0.0.1:2801/api}"
exec npx --yes @lhci/cli@0.14.0 autorun
