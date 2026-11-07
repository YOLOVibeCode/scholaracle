#!/usr/bin/env bash
# Run the Maestro end-to-end flows on the iOS Simulator or the Android Emulator.
#
#   scripts/e2e.sh ios|android [launch|smoke|sync|all] [--no-build]
#
# Builds a local Release app (no EAS credits) pointed at E2E_API_URL
# (default: the UAT API), installs it, then runs the flows in e2e/maestro.
#
# Logins: flows other than "launch" need MAESTRO_* variables. Locally, keep them as
# op:// references in E2E_ENV_FILE (default ~/.config/scholarmancy/e2e.env,
# template: e2e/e2e.env.example). The script runs Maestro under `opx run --env-file`.
# In CI, export MAESTRO_PARENT_EMAIL (and related vars) directly — opx is skipped.
# Maestro's per-step logs can contain typed text; they are deleted after the run.
# Screenshots go to E2E_ARTIFACTS_DIR (outside the repo by default).
set -euo pipefail

platform="${1:-}"; suite="${2:-launch}"; build=1
[[ "${3:-}" == "--no-build" || "${2:-}" == "--no-build" ]] && build=0
[[ "$suite" == "--no-build" ]] && suite=launch
case "$platform" in ios|android) ;; *) echo "usage: $0 ios|android [launch|smoke|sync|all] [--no-build]" >&2; exit 2;; esac

here="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  export JAVA_HOME="${JAVA_HOME:-${RUNNER_JAVA_HOME:-}}"
  export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
else
  export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
fi
maestro_path=""
for d in "$HOME/.maestro/bin" "$HOME/.maestro-cli/maestro/bin"; do
  if [[ -x "$d/maestro" ]]; then maestro_path="$d"; break; fi
done
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}${maestro_path:+$maestro_path:}$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
export MAESTRO_CLI_NO_ANALYTICS=1
api_url="${E2E_API_URL:-https://api-uat.scholarmancy.com}"
ios_device="${E2E_IOS_DEVICE:-iPhone 17 Pro}"
avd="${E2E_ANDROID_AVD:-scholarmancy-e2e}"
env_file="${E2E_ENV_FILE:-$HOME/.config/scholarmancy/e2e.env}"
if [[ -n "${E2E_ARTIFACTS_DIR:-}" ]]; then
  artifacts="${E2E_ARTIFACTS_DIR}"
else
  artifacts="$HOME/Library/Caches/scholarmancy-e2e/$(date +%Y%m%d-%H%M%S)-$platform-$suite"
fi
mkdir -p "$artifacts"

command -v maestro >/dev/null || {
  echo "maestro not found (install: curl -Ls https://get.maestro.mobile.dev | bash)" >&2
  exit 1
}

start_device() {
  if [[ "$platform" == ios ]]; then
    xcrun simctl boot "$ios_device" 2>/dev/null || true
    xcrun simctl bootstatus "$ios_device" -b >/dev/null
  else
    if ! adb devices | grep -q 'emulator-.*device$'; then
      nohup emulator -avd "$avd" -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect >/dev/null 2>&1 &
      adb wait-for-device
    fi
    until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; do sleep 3; done
  fi
}

build_app() {
  cd "$here"
  export EXPO_PUBLIC_API_URL="$api_url"
  if [[ "$platform" == ios ]]; then
    npx expo run:ios --configuration Release --device "$ios_device" --no-bundler
  else
    export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.jvmargs=-Xmx6g\ -XX:MaxMetaspaceSize=2g"
    npx expo run:android --variant release --no-bundler
  fi
}

flows=()
case "$suite" in
  launch) flows=(e2e/maestro/launch.yaml) ;;
  smoke) flows=(e2e/maestro/launch.yaml e2e/maestro/smoke.yaml) ;;
  sync) flows=(e2e/maestro/sync-portal.yaml) ;;
  all) flows=(e2e/maestro/launch.yaml e2e/maestro/smoke.yaml e2e/maestro/sync-portal.yaml) ;;
  *) echo "unknown suite: $suite" >&2; exit 2 ;;
esac

start_device
[[ $build -eq 1 ]] && build_app

cd "$here"
debug_dir="$(mktemp -d)"
trap 'rm -rf "$debug_dir"' EXIT
maestro_cmd=(maestro --platform "$platform" test --format junit --output "$artifacts/report.xml"
  --test-output-dir "$artifacts" --debug-output "$debug_dir" "${flows[@]}")

set +e
if [[ "$suite" == launch ]]; then
  "${maestro_cmd[@]}"
elif [[ -n "${MAESTRO_PARENT_EMAIL:-}" ]]; then
  "${maestro_cmd[@]}"
else
  [[ -f "$env_file" ]] || {
    echo "missing $env_file (copy e2e/e2e.env.example and fill in op:// references)" >&2
    exit 1
  }
  command -v opx >/dev/null || { echo "opx not found" >&2; exit 1; }
  opx run --env-file "$env_file" --reason "Scholarmancy $platform E2E ($suite) on the $platform simulator" -- "${maestro_cmd[@]}"
fi
rc=$?
set -e
find "$artifacts" -type f \( -name 'commands-*.json' -o -name '*.log' \) -delete 2>/dev/null || true
echo "result: $([[ $rc -eq 0 ]] && echo PASS || echo FAIL) ($platform, $suite) — artifacts: $artifacts"
exit $rc
