#!/usr/bin/env bash
# Build the workers Docker image.
#
# The scrapers repo (scholaracle_scrapers) lives outside the monorepo.
# pnpm-lock.yaml references it as file:../../scholaracle_scrapers (relative to
# the monorepo root). Inside Docker we copy scrapers to /scholaracle_scrapers
# and patch the lockfile reference so pnpm install resolves correctly.
#
# Usage:
#   ./scripts/build-workers.sh              # build production image
#   ./scripts/build-workers.sh --no-cache   # rebuild from scratch

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRAPERS_SRC="$(cd "$MONOREPO_ROOT/../../scholaracle_scrapers" 2>/dev/null && pwd || echo "")"

if [ -z "$SCRAPERS_SRC" ] || [ ! -d "$SCRAPERS_SRC" ]; then
  echo "❌ Cannot find scholaracle_scrapers directory."
  echo "   Expected at: $MONOREPO_ROOT/../../scholaracle_scrapers"
  exit 1
fi

# Copy scrapers into monorepo as .scrapers/ (gitignored)
echo "📦 Copying scrapers into build context..."
rm -rf "$MONOREPO_ROOT/.scrapers"
rsync -a \
  --exclude='node_modules' \
  --exclude='.git' \
  "$SCRAPERS_SRC/" "$MONOREPO_ROOT/.scrapers/"

# Ensure .scrapers is gitignored
if ! grep -qF '.scrapers' "$MONOREPO_ROOT/.gitignore" 2>/dev/null; then
  echo '.scrapers/' >> "$MONOREPO_ROOT/.gitignore"
fi

echo "🐳 Building workers image..."

DOCKER_BUILDKIT=1 docker build \
  -f "$MONOREPO_ROOT/Dockerfile.workers" \
  --target production \
  -t scholaracle-workers:latest \
  "$MONOREPO_ROOT" \
  "$@"

# Clean up
rm -rf "$MONOREPO_ROOT/.scrapers"

echo "✅ Workers image built: scholaracle-workers:latest"
