# Production Readiness — What’s Left

**First written:** 2026-03-02
**Checked against the code and the running services:** 2026-11-26
**Purpose:** Single checklist of what remains before production. Use with [FULL_STATE_AUDIT.md](./FULL_STATE_AUDIT.md), [grade-history-trends-production-checklist.md](./grade-history-trends-production-checklist.md), [`DEFECTS.md`](../DEFECTS.md) and [`RAILWAY_DEPLOYMENT.md`](../RAILWAY_DEPLOYMENT.md).

Production is live at https://scholarmancy.com and https://api.scholarmancy.com. This file is about what is unfinished around it.

---

## Build & tests

| Project | How it is checked |
|--------|--------|
| **scholaracle** (monorepo) | CI runs lint, format, build, a Docker build, the mobile bundle check, every package's tests and Playwright E2E on each pull request. Locally: `pnpm build` and `pnpm test`. |
| **scholaracle_scrapers** | `npm run build` and `npm test`. |

---

## Code gaps

### Scholaracle (API & app)

| Item | Location | Priority | Notes |
|------|----------|----------|--------|
| **Push notifications** | `packages/agents` (`ExpoPushDelivery`), `packages/mobile/src/notifications/pushSetup.ts`, `packages/web/app/dashboard/settings/page.tsx` | Decide | The phone app registers an Expo push token (`POST /api/account/push-token`) and the workers can deliver through Expo. The web settings switch for push is still disabled and says "coming soon". Web push (`PushDelivery`, VAPID keys) does nothing. Decide whether phone push is on, then enable the switch or say so in the app. |
| **Add student wizard forgets its place** | `packages/web/components/dashboard/AddStudentWizard.tsx` | Medium | A refresh loses what was typed (DEF-008). |
| **Store webhook has no timestamp window** | `packages/api/src/routes/webhooks/noctusoft/` | Medium | Event ids are deduped; an old signed event is not refused on age (DEF-007). |
| **Browser extension** | `packages/browser-extension` | Before publishing | Not in the Chrome Web Store. Its pages say Scholarmancy since #207. The tracked `scholarmancy-sync-v1.0.0.zip` is a build from August 2026 and still has the old text and the old API address hint in it: build a fresh zip before publishing. |
| **Flaky integration test** | `packages/agents/src/integration/NotificationFlow.integration.test.ts` | Low | Noted in March: the worker completes but the mock transport is not always called. Not re-checked. |

### Scholaracle Scrapers

| Item | Location | Priority | Notes |
|------|----------|----------|--------|
| **OS-level scheduling** | `src/cli/schedule.ts` | Medium | Schedules are saved to config; launchd, cron and schtasks are not installed by the CLI. Users can use external cron. |
| **Template placeholders** | `src/scrapers/_template/template-scraper.ts` | N/A | TODOs are intentional for new scraper authors. |

---

## Security & config (production)

Checked on 26 Nov 2026 by listing variable names on Railway. Secret values were not read.

- [x] **`JWT_SECRET`** and **`CONNECTOR_JWT_SECRET`** set on the API. The server refuses to start in production without a token secret.
- [x] **`CORS_ORIGINS`** set on the API to the real web origins.
- [x] **Seeding** closed in production: the seed routes answer "Seed routes are not available on this server".
- [x] **Billing**: the production API has `RELAY_API_KEY`, `RELAY_WEBHOOK_SECRET`, `RELAY_STORE_ALIAS=scholarmancy` and `RELAY_STORE_MODE=live`.
- [x] **Email** goes through the relay (`SENDGRID_BASE_URL`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`) on the API and the workers.
- [x] **`BASE_URL`** on the API and, since 26 Nov 2026, on the workers. Without it on the workers, digest and alert emails carry no link to the dashboard (DEF-026).
- [x] **Web security headers** (HTTPS-only, framing, content type), since #191.
- [x] **Failed sign-ins are limited**, since #205: ten per account and address and a hundred per address inside fifteen minutes, and five wrong admin authenticator codes per admin. The counts live in the API's memory, which holds while the API runs as one instance (RISK-027).
- [x] **The other secrets the services need** are set where `RAILWAY_DEPLOYMENT.md` says they must be: `INTERNAL_API_SECRET` (API and web), `CREDENTIALS_ENCRYPTION_KEY` (API and workers), `COMMUNICATIONS_WEBHOOK_SECRET` (API), `LITELLM_API_KEY` (API and workers).
- [ ] **Error reporting**: `SENTRY_DSN` is on no service, so an error in production is a line in the Railway logs and nobody is told (RISK-028).
- [ ] **Leftover variables**: thirteen names are set on Railway and used by nothing, two of them direct model-vendor keys (`RAILWAY_DEPLOYMENT.md`, "Set on Railway and used by nothing"). Removing them is the owner's call.
- [ ] **Backups**: a schedule for the production database volume and the assets volume.
- [ ] **Text messages**: the site offers alerts by text and Settings has the opt-in. Texting is on only where `NOCTUSOFT_API_KEY` is set on the API and the workers (`RAILWAY_DEPLOYMENT.md`, "Switches"). On 26 Nov 2026 it is set nowhere, so no text goes out (DEF-027).
- [ ] **Asset store**: production keeps assets on a Railway volume (`ASSET_STORE=local`, `/data/assets`). The other backends are `s3` and `relay`; see `packages/api/docs/ASSET_STORAGE.md`. Moving is a decision, not a defect.
- [ ] **Sign in with Apple token revocation**: the code is live (#173) and waits for `APPLE_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID` and `APPLE_SIGN_IN_PRIVATE_KEY` on the API. App Review asks for it (5.1.1(v)).
- [ ] **Agenda summaries by AI**: off. `AGENDA_AI_ENABLED=true` on the API turns them on; they go through the relay.
- [ ] **Student weekly review**: on in dev only (`WEEKLY_REVIEW_ENABLED=true` on the dev workers).

---

## Getting the phone app

- **iPhone and iPad:** TestFlight only, through the public link on `/get-app`. The app is not in the App Store.
- **Android:** not available. The app is not in Google Play.
- The site and the app's "Update required" screen name only what exists. On the day a store listing is live, change both places in one pull request:
  - `packages/web/lib/app-downloads.ts` (the site's buttons)
  - `packages/api/src/routes/health/health.ts` (the links the app is sent)
- The store listing text and pictures are in `packages/mobile/store-metadata/`. `packages/mobile/README.md` says how to push them.

---

## Feature completeness

- **Invite flow:** the parent invite API sends the invite email through `sendInviteEmail` when mail is configured (POST `/:id/parents/invite` and POST `/:id/contacts`). Production has mail and `BASE_URL` set.
- **Scraper flow:** API generate, download and validate, and the scrapers library, are production-ready per [scraper-flow-readiness.md](./scraper-flow-readiness.md). It has a manual checklist for the single, bundle and all-students paths.
- **Grade history / Trends:** use [grade-history-trends-production-checklist.md](./grade-history-trends-production-checklist.md) before enabling in production.
- **Demo:** the one-click demo on the home page exists on a developer machine only. UAT has the demo household behind the normal sign-in page. Production's demo sign-in is private and kept for app reviewers. See [UAT.md](./UAT.md).
- **E2E:** FULL_STATE_AUDIT §5–§6 and scraper-flow-readiness describe coverage and optional gaps. The parent side has no E2E at phone width (`NEXT_STEPS.md` item 9).

---

## Deploy

- **Railway:** a push to `main` deploys dev at once. Production releases the same commit after every check on it is green. See [`RAILWAY_DEPLOYMENT.md`](../RAILWAY_DEPLOYMENT.md).
- **Health:** `curl https://api.scholarmancy.com/api/health` after deploy; `curl https://api.scholarmancy.com/api/health/version` names the commit that is live.
- **Rollback:** Railway dashboard → previous deployment → Redeploy; or revert and push.

---

## Quick “ready to ship” checklist

1. [ ] Scholaracle: CI is green on the commit.
2. [ ] Scrapers: `npm run build` and `npm test` pass.
3. [ ] Production variables match the list in `RAILWAY_DEPLOYMENT.md`, on every service.
4. [ ] `https://api.scholarmancy.com/api/health/version` reports the commit you meant to ship.
5. [ ] Optional: run the scraper-flow-readiness manual checklist (single, bundle, all-students).
6. [ ] Optional: run grade-history-trends-production-checklist if shipping Trends.
