#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner, whose `script:` executes each line
# as a separate `sh -c` (no pipefail, and cd/export do not carry over). Keep the logic here.
set -euo pipefail
mode="${1:?usage: ci-android-maestro.sh launch-smoke|sync}"
root="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/../../.." && pwd)}"
cd "$root/packages/mobile"
# CI emulators are slow to start the Maestro driver (default timeout was exceeded).
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-240000}"
case "$mode" in
  launch-smoke)
    E2E_ARTIFACTS_DIR="$root/mobile-maestro-artifacts/android-launch" pnpm e2e:android launch
    E2E_ARTIFACTS_DIR="$root/mobile-maestro-artifacts/android-smoke" pnpm e2e:android smoke --no-build
    ;;
  sync)
    (cd "$root" && FAKE_PORTAL_STRICT_CSP=1 FAKE_PORTAL_PORT=2855 node scripts/fake-portal-server.mjs) &
    sleep 3
    E2E_ARTIFACTS_DIR="$root/mobile-maestro-artifacts/android-sync" \
    MAESTRO_PORTAL_PROVIDER=skyward \
    MAESTRO_PORTAL_URL='http://10.0.2.2:2855/skyward/login?csp=strict' \
    MAESTRO_PORTAL_USERNAME=demo MAESTRO_PORTAL_PASSWORD=demo MAESTRO_USE_FAKE_PORTAL=1 \
      pnpm e2e:android sync --no-build
    ;;
  *) echo "unknown mode: $mode" >&2; exit 2 ;;
esac
