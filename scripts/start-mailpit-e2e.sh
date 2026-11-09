#!/usr/bin/env bash
set -euo pipefail

MAILPIT_VERSION="${MAILPIT_VERSION:-v1.27.7}"
BIN_DIR="${TMPDIR:-/tmp}/mailpit-e2e-$$"
mkdir -p "$BIN_DIR"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64 | amd64) ASSET="mailpit-linux-amd64.tar.gz" ;;
  aarch64 | arm64) ASSET="mailpit-linux-arm64.tar.gz" ;;
  *)
    echo "unsupported architecture for mailpit e2e: $ARCH" >&2
    exit 1
    ;;
esac

curl -fsSL -o /tmp/mailpit-e2e.tgz \
  "https://github.com/axllent/mailpit/releases/download/${MAILPIT_VERSION}/${ASSET}"
tar xzf /tmp/mailpit-e2e.tgz -C "$BIN_DIR"
exec "$BIN_DIR/mailpit" --smtp "0.0.0.0:2803" --listen "0.0.0.0:2804"
