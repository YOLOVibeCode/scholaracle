#!/usr/bin/env bash
#
# Scholaracle Scrape Test Harness
#
# Runs the production adapter code against real credentials and validates
# the output conforms to the ingest envelope contract.
#
# Usage:
#   ./harness.sh skyward --url "https://skyward.district.net/..." --username user --password pass
#   ./harness.sh canvas --url "https://school.instructure.com" --token "your-token"
#   ./harness.sh google-classroom --token "ya29.your-oauth-token"
#   ./harness.sh oneroster --url "https://sis.district.edu/..." --token "token"
#
# Or with environment variables:
#   HARNESS_URL="..." HARNESS_USERNAME="..." HARNESS_PASSWORD="..." ./harness.sh skyward
#
# Output:
#   - Validation report to stdout
#   - Raw envelope JSON to ./harness-output/<provider>-<timestamp>.json
#   - Report JSON to ./harness-output/<provider>-<timestamp>.report.json
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo ""
  echo "Scholaracle Scrape Test Harness"
  echo ""
  echo "Usage:"
  echo "  ./harness.sh <provider> [options]"
  echo ""
  echo "Providers:"
  echo "  skyward          Skyward Family Access (scraper)"
  echo "  canvas           Canvas LMS (REST API)"
  echo "  google-classroom Google Classroom (REST API)"
  echo "  oneroster        OneRoster v1.1/v1.2 (REST API)"
  echo ""
  echo "Options:"
  echo "  --url <url>              Base URL / portal URL"
  echo "  --token <token>          API access token"
  echo "  --username <user>        Username (Skyward)"
  echo "  --password <pass>        Password (Skyward)"
  echo "  --client-id <id>         OAuth client ID (OneRoster)"
  echo "  --client-secret <secret> OAuth client secret (OneRoster)"
  echo "  --no-save                Don't write output files"
  echo ""
  echo "Examples:"
  echo "  # Skyward"
  echo "  ./harness.sh skyward \\"
  echo "    --url \"https://skyward.district.net/scripts/wsisa.dll/...\" \\"
  echo "    --username student1 --password pass123"
  echo ""
  echo "  # Canvas"
  echo "  ./harness.sh canvas \\"
  echo "    --url \"https://school.instructure.com\" \\"
  echo "    --token \"your-api-token\""
  echo ""
  echo "  # Or with env vars:"
  echo "  HARNESS_URL=\"...\" HARNESS_TOKEN=\"...\" ./harness.sh canvas"
  echo ""
  exit 0
fi

# Check if ts-node is available
if ! command -v npx &> /dev/null; then
  echo "Error: npx not found. Install Node.js first."
  exit 1
fi

# Run the TypeScript harness with the same args
cd "$SCRIPT_DIR"
exec npx ts-node --transpile-only src/harness/harness.ts "$@"
