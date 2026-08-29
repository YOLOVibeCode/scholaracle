# UAT & TestFlight Pipeline Runbook

## Environment map

| Layer | Host | Railway service | EAS channel |
|---|---|---|---|
| UAT API | `api-uat.scholarmancy.com` | `api` / env `dev` | — |
| UAT Web | `web-uat.scholarmancy.com` | `web` / env `dev` | — |
| Prod API | `api.scholarmancy.com` | `api` / env `production` | — |
| Prod Web | `scholarmancy.com` | `web` / env `production` | — |
| TestFlight preview (UAT) | build #44+ | — | `preview` → UAT API |
| TestFlight production | build #45+ | — | `production` → prod API |
| Play internal (UAT) | build `8faad8ba` | — | `preview` → UAT API |
| Play alpha (prod) | build `0e340595` | — | `production` → prod API |

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
         → E2E vs dev (Playwright, 54 specs)
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
3. The public TestFlight link (`https://testflight.apple.com/join/YMAKAqh8`) is active
   once Apple approves the first external build (review typically 24–48 h).

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
