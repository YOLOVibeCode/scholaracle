# UAT & TestFlight Pipeline Runbook

## Environment map

| Layer | Host | Railway service | EAS channel |
|---|---|---|---|
| UAT API | `api-uat.scholarmancy.com` | `api` / env `dev` | — |
| UAT Web | `web-uat.scholarmancy.com` | `web` / env `dev` | — |
| Prod API | `api.scholarmancy.com` | `api` / env `production` | — |
| Prod Web | `scholarmancy.com` | `web` / env `production` | — |
| TestFlight preview (UAT) | a `preview` build | — | `preview` → UAT API |
| TestFlight production | a `production` build | — | `production` → prod API |
| Play internal (UAT) | a `preview` build | — | `preview` → UAT API |
| Play alpha (prod) | a `production` build | — | `production` → prod API |

Build numbers change with every build, so this table does not name them. App Store Connect → TestFlight and Play Console → Testing show what is there now. On 26 Nov 2026: TestFlight build #51 (`production`) is the one outside testers get, and it expires on 11 Feb 2027; Google Play has 1.0.0 (11) on the internal track.

Railway internal URLs (`*-dev-*.up.railway.app`, `*-production-*.up.railway.app`) are
only used by CI health checks; they are never exposed to users or the mobile app.

## Full pipeline (every push to `main`)

```
push → Railway deploys dev (auto, no CI wait)
      → CI Gate (lint, type-check, all unit tests, Docker pre-build)
         → wait-for-dev (15 min timeout)
              polls api-dev-c268.up.railway.app    SHA match
              polls web-dev-8552.up.railway.app    SHA match
              polls api-uat.scholarmancy.com        SHA match  ← TestFlight host
              polls web-uat.scholarmancy.com        SHA match  ← branded UAT web
              UAT mobile-contract smoke:
                POST /api/auth/login (demo) → 200
                POST /api/auth/magic (bogus) → 4xx
              App Store legal pages: /privacy /terms /support /delete-account → 200
         → E2E vs dev (Playwright)
         → OTA → TestFlight preview
              fingerprint guard: if fingerprint changed → warning, skip OTA
              if fingerprint matches → eas update --channel preview
      → Railway releases prod (Wait for CI gate)
```

## Demo account

| Field | Value |
|---|---|
| Email | `demo@scholarmancy.com` |
| Password | `DemoPass123!` |
| Household | Sarah Mitchell · students Emma & Liam |
| Seed route | `POST /api/seed/demo` (dev only) |

The seed is idempotent. Playwright E2E calls it on every run.

**Where this sign-in works:** on a developer machine and on UAT. It does not work on production.

- **Developer machine:** the home page shows "Try the demo", which loads the seed and signs in.
- **UAT:** the button is not shown on a deployed site. Sign in on `/login` with the email and password above.
- **Production:** the demo parent's password is `DEMO_ACCOUNT_PASSWORD`, a private value in the vault that is given to App Store and Google Play reviewers (`RAILWAY_DEPLOYMENT.md`, "Switches"). Do not use it to try something out: a sign-in with it first restores the demo household, which undoes whatever a reviewer or a tester did there.

## OTA vs binary rebuild

OTA updates (Expo Updates / EAS Update) push new JavaScript to existing
TestFlight binaries. An OTA **cannot** be used when:

- A new native module was added or removed (`package.json` dependency)
- An Expo plugin was added/removed (`app.json` `plugins` array)
- An entitlement changed (`usesAppleSignIn`, associated domains, etc.)
- The SDK major version changed

In these cases the pipeline fingerprint guard emits a warning and skips the OTA.
You must run a full binary rebuild:

```bash
cd packages/mobile
pnpm build:ios:preview        # preview → TestFlight (UAT)
pnpm ship:production:ios      # production → TestFlight (prod)
```

Manual OTA (outside CI):

```bash
cd packages/mobile
pnpm update:preview           # preview channel
pnpm update:production        # production channel (keep manual)
```

## Adding a new tester to TestFlight

1. App Store Connect → Scholarmancy → TestFlight → PilotTesting (External) → Testers → +
2. Enter email. Apple sends an invitation; no code required.
3. The public TestFlight link (`https://testflight.apple.com/join/YMAKAqh8`) is active.
   It is the link `/get-app` gives parents, and it installs the `production` build.
   The link has a tester limit, set on the group in App Store Connect (25 on 26 Nov 2026).
   A new external build needs Apple's beta review before testers get it (typically 24–48 h).

## GitHub secrets required

| Secret | Purpose | How to create |
|---|---|---|
| `RAILWAY_TOKEN` | Railway CLI in CI | railway.app → Account → Tokens |
| `EXPO_TOKEN` | EAS Update (OTA) from CI | expo.dev → Account settings → Access tokens |

## Recovery: stuck Railway dev builds

Symptom: `wait-for-dev` times out; `railway deployment list -s web --environment dev`
shows one or more `DEPLOYING` entries older than 30 minutes.

```bash
# 1. Force a fresh build from the current HEAD commit
cd scholaracle
railway deployment redeploy -s web --environment dev --from-source -y
railway deployment redeploy -s api --environment dev --from-source -y

# 2. Wait for the new builds to succeed (~5–10 min), then re-run CI
gh run rerun --failed $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
```

If prod is stuck (Railway "Wait for CI" never fires because CI reruns don't
re-trigger the Railway webhook):

```bash
railway deployment redeploy -s web --environment production --from-source -y
railway deployment redeploy -s api --environment production --from-source -y
```

## DNS records for UAT web domain

When `web-uat.scholarmancy.com` was created, Railway provided:

| Type | Name | Value |
|---|---|---|
| CNAME | `web-uat` | `vs1ip4l3.up.railway.app` |
| TXT | `_railway-verify.web-uat` | `railway-verify=634746954dddfd2abf67111bb966fcff4adc2a96cd7133d1c1fd0d2e856e47cf` |

Add both records at your DNS provider (same provider as `api-uat`). After
propagation, run `railway domain status 3437b1f4-4163-4a27-925d-26723fb680c5`
to confirm the certificate is ACTIVE.
