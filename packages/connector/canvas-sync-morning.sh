#!/usr/bin/env bash
#
# Canvas incremental sync — run early in the morning on the client machine.
# Fetches stats (grades, assignments) and downloads new files only.
# Uses harness-output/canvas-sync-state.json to skip already-downloaded files.
#
# Schedule with cron (e.g., 6:00 AM daily):
#   0 6 * * * /path/to/canvas-sync-morning.sh >> /path/to/canvas-sync.log 2>&1
#
# Or macOS launchd: put a plist in ~/Library/LaunchAgents/
#
# Required env (or edit below):
#   CANVAS_URL, CANVAS_GOOGLE_EMAIL, CANVAS_GOOGLE_PASSWORD
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load from .env if present
if [ -f .env.canvas ]; then
  set -a
  source .env.canvas
  set +a
fi

: "${CANVAS_URL:?Set CANVAS_URL (e.g. https://ldisd.instructure.com)}"
: "${CANVAS_GOOGLE_EMAIL:?Set CANVAS_GOOGLE_EMAIL}"
: "${CANVAS_GOOGLE_PASSWORD:?Set CANVAS_GOOGLE_PASSWORD}"

echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Canvas incremental sync starting"
npx ts-node --transpile-only src/harness/canvas-browser-scrape.ts
echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Canvas incremental sync done"
