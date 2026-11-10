#!/usr/bin/env bash
# Run the Maestro end-to-end flows on the iOS Simulator or the Android Emulator.
#
#   scripts/e2e.sh ios|android [launch|smoke|tour|sync|share|all] [--no-build]
#
# Builds a local Release app (no EAS credits) pointed at E2E_API_URL
# (default: the UAT API), installs it, then runs the flows in e2e/maestro.
#
# Logins: flows other than "launch" need MAESTRO_* variables. Locally, keep them as
# op:// references in E2E_ENV_FILE (default ~/.config/scholarmancy/e2e.env,
# template: e2e/e2e.env.example). The script runs Maestro under `opx run --env-file`.
# In CI, export MAESTRO_PARENT_EMAIL (and related vars) directly — opx is skipped.
# The "share" suite (owner invites, co-parent accepts) also needs a second UAT account in
# MAESTRO_COPARENT_EMAIL / MAESTRO_COPARENT_PASSWORD; it is not part of "all".
# Maestro's per-step logs can contain typed text; they are deleted after the run.
# Screenshots go to E2E_ARTIFACTS_DIR (outside the repo by default).
set -euo pipefail

platform="${1:-}"; suite="${2:-launch}"; build=1
[[ "${3:-}" == "--no-build" || "${2:-}" == "--no-build" ]] && build=0
[[ "$suite" == "--no-build" ]] && suite=launch
case "$platform" in ios|android) ;; *) echo "usage: $0 ios|android [launch|smoke|tour|sync|share|all] [--no-build]" >&2; exit 2;; esac

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
# expo run:ios treats an unmatched name as a physical device and demands code signing;
# resolve a simulator name to its UDID so the build always targets the simulator.
if [[ "$platform" == ios && ! "$ios_device" =~ ^[0-9A-F-]{36}$ ]]; then
  udid="$(xcrun simctl list devices available | grep -F "    $ios_device (" | head -1 | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true)"
  [[ -n "$udid" ]] && ios_device="$udid"
fi
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
    # Build for the simulator with xcodebuild, ad-hoc signed ("Sign to Run Locally", no
    # certificate): `expo run:ios` demands a certificate on CI, and an unsigned build loses
    # the keychain entitlement SecureStore needs to save the session.
    npx expo prebuild --platform ios --no-install >/dev/null
    (cd ios && pod install >/dev/null)
    local ws scheme app
    ws="$(ls -d ios/*.xcworkspace | head -1)"
    scheme="$(basename "$ws" .xcworkspace)"
    xcodebuild -quiet -workspace "$ws" -scheme "$scheme" -configuration Release \
      -sdk iphonesimulator -destination "id=$ios_device" -derivedDataPath build/e2e-ios \
      CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
      CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=YES
    app="$(ls -d build/e2e-ios/Build/Products/Release-iphonesimulator/*.app | head -1)"
    xcrun simctl install "$ios_device" "$app"
  else
    export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.jvmargs=-Xmx6g\ -XX:MaxMetaspaceSize=2g"
    # E2E builds only: the fake portal is plain http (10.0.2.2:2855), which Android
    # blocks by default (ERR_CLEARTEXT_NOT_PERMITTED). Shipped builds never get this.
    npx expo prebuild --platform android --no-install >/dev/null
    sed -i.bak 's/<application /<application android:usesCleartextTraffic="true" /' \
      android/app/src/main/AndroidManifest.xml && rm -f android/app/src/main/AndroidManifest.xml.bak
    npx expo run:android --variant release --no-bundler
  fi
}

flows=()
case "$suite" in
  launch) flows=(e2e/maestro/launch.yaml) ;;
  smoke) flows=(e2e/maestro/launch.yaml e2e/maestro/smoke.yaml) ;;
  tour) flows=(e2e/maestro/login-screen.yaml e2e/maestro/tour.yaml e2e/maestro/student-edit.yaml) ;;
  sync) flows=(e2e/maestro/sync-portal.yaml) ;;
  share) flows=(e2e/maestro/share.yaml e2e/maestro/accept.yaml) ;;
  all) flows=(e2e/maestro/launch.yaml e2e/maestro/login-screen.yaml e2e/maestro/smoke.yaml e2e/maestro/tour.yaml e2e/maestro/student-edit.yaml e2e/maestro/sync-portal.yaml) ;;
  *) echo "unknown suite: $suite" >&2; exit 2 ;;
esac

# The share suite needs a second account. Check that the variables are present (names only:
# in the direct-env case that they are exported, in the opx case that the file names them).
if [[ "$suite" == share ]]; then
  if [[ -n "${MAESTRO_PARENT_EMAIL:-}" ]]; then
    [[ -n "${MAESTRO_COPARENT_EMAIL:-}" && -n "${MAESTRO_COPARENT_PASSWORD:-}" ]] || {
      echo "share suite needs MAESTRO_COPARENT_EMAIL and MAESTRO_COPARENT_PASSWORD (a second UAT account)" >&2
      exit 2
    }
  elif [[ -f "$env_file" ]]; then
    grep -q '^MAESTRO_COPARENT_EMAIL=' "$env_file" && grep -q '^MAESTRO_COPARENT_PASSWORD=' "$env_file" || {
      echo "share suite needs MAESTRO_COPARENT_EMAIL and MAESTRO_COPARENT_PASSWORD in $env_file (see e2e/e2e.env.example)" >&2
      exit 2
    }
  fi
fi

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
