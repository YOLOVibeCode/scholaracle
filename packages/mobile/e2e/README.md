# Mobile end-to-end tests

Maestro flows that drive the real app on the iOS Simulator and the Android
Emulator. The simulator uses WKWebView and the emulator uses Android System
WebView, the same engines as real phones, so the portal sign-in and scraping
run the same way they do for parents.

## Run

From `packages/mobile`:

```bash
pnpm e2e:ios launch        # build a local Release app, check it boots (no logins)
pnpm e2e:android launch
pnpm e2e:ios smoke         # parent sign-in, student list, dashboard
pnpm e2e:ios sync          # connect the portal, sign in, scrape, check grades
pnpm e2e:android all       # every flow
pnpm e2e:ios sync --no-build   # reuse the installed app
```

Local builds use Xcode and Gradle on this Mac, not EAS, so they cost no build
credits. The app points at `E2E_API_URL`, which defaults to the UAT API.

## One-time setup on a Mac

- Xcode with an iPhone simulator (`E2E_IOS_DEVICE`, default `iPhone 17 Pro`).
- JDK 17: `brew install openjdk@17`.
- Android SDK in `~/Library/Android/sdk` with `platform-tools`, `emulator`,
  `platforms;android-36` and `system-images;android-36;google_apis;arm64-v8a`,
  and an AVD named `scholarmancy-e2e` (`E2E_ANDROID_AVD`).
- Maestro CLI in `~/.maestro-cli/maestro/bin`, unpacked from the `maestro.zip`
  asset of a release at https://github.com/mobile-dev-inc/maestro/releases.

## CI (GitHub Actions)

Workflow [`.github/workflows/mobile-e2e.yml`](../../../.github/workflows/mobile-e2e.yml)
runs `launch` and `smoke` on macOS (iOS Simulator) and Linux (Android emulator).
`sync-portal` uses the fake portal from
[`packages/e2e/fake-portal`](../../e2e/fake-portal/README.md) (`demo` / `demo`,
port **2855**) — never real district logins in CI. Set repository secrets
`MAESTRO_PARENT_EMAIL`, `MAESTRO_PARENT_PASSWORD`, and `MAESTRO_STUDENT_NAME` for
smoke/sync parent login against UAT.

## Logins

Every flow except `launch` needs the variables listed in `e2e.env.example`.
Copy it to `~/.config/scholarmancy/e2e.env`, outside the repo, and fill in
`op://` references to 1Password items. The runner reads the file through
`opx run --env-file`, so each run asks for one approval and no value is
printed or passed on a command line. Never commit real values or item ids.

## Privacy

This repository is public. Screenshots from a sync show a real child's grades,
so they are written to `E2E_ARTIFACTS_DIR` (default
`~/Library/Caches/scholarmancy-e2e`), not to the repo. Maestro's step logs can
contain typed text, so the runner deletes them after each run.

## Portal sign-in subflows

`subflows/portal-signin-*.yaml` type into the portal's own sign-in page in the
WebView. Field labels vary by district, so tune them on the first live run.
Districts that use Google or Clever sign-in need their own subflow.

## Before each release: real phones (about 10 minutes)

Simulators cannot cover everything. On one iPhone (TestFlight build) and one
Android phone (Play internal testing build):

1. Install the new build over the previous one and open it: you stay signed in.
2. Sign out, then sign in with email and password.
3. Sign in with Google (and Apple on iPhone).
4. Open a student: courses and grades match the portal.
5. Tap Sync and sign in to the portal: the page stays inside the app (no
   blank screen or second window), and the sync finishes with "Sync complete!".
6. After the sync, compare two courses and two assignments against the portal:
   same grade, score and category.
7. Turn on alerts: the system permission prompt appears; a test alert arrives.
8. Put the app in the background for a minute and reopen it: no sign-in loop.
9. Turn on airplane mode and open the app: a clear offline message, no crash.

Record the build numbers and the result in the release notes.
