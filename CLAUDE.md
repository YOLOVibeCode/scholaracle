# Scholaracle — operating rules

PNPM monorepo. Ports: 2800 web / 2801 api / 2802 mongo. Stack: TS strict, Express 4, MongoDB, Next.js 16, Expo SDK 57 / RN 0.86.

Follow the rules in ~/Dev/BestPractices/ — read the relevant file before working
on that domain (payments, EAS builds, store submission, testing, CI).

## Shipping the mobile app

### Decision: update vs rebuild

Check whether the native fingerprint changed before choosing a ship path:

```bash
npx @expo/fingerprint .       # compare to last deployed build's fingerprint
```

**Rebuild required** (native fingerprint changes) when:
- Native module added or removed
- Config plugin added, changed, or removed
- Permissions, entitlements, icons, or splash changed
- Expo SDK or React Native version upgraded

**OTA update** (fingerprint unchanged) for everything else — JS, assets, styling, copy.

### JS/asset change → OTA (no build credits)

From `packages/mobile`, in this order:

```bash
pnpm update:preview      # preflight + eas update --channel preview
# QA on the preview TestFlight build, then:
pnpm update:production   # preflight + eas update --channel production
```

Rollback: `npx eas-cli update:republish --branch production` to restore the last good bundle. Never delete an update.

### Native change → full binary

From `packages/mobile`, always in this order:

**iOS:**
```bash
export ASC_API_KEY_PATH=/Users/admin/Dev/YOLOProjects/scholarmancy/AuthKey_RA29BTM8KJ.p8
pnpm build:ios     # preflight (doctor + tsc + version check + bundle export) THEN eas build (~5 min)
pnpm submit:ios    # push latest build to TestFlight
```

**Android:**
```bash
export GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/play-service-account.json
pnpm build:android  # preflight THEN eas build (~8 min); EAS manages the upload keystore
pnpm submit:android # push latest AAB to Play internal testing track
```

- **Never call `eas build` directly** — the `build:*` scripts run preflight first; each skipped preflight historically cost a full remote build to discover the same error.
- Build numbers auto-increment: iOS `buildNumber` and Android `versionCode` both increment via `appVersionSource: remote`.
- The iOS ASC key (`AuthKey_RA29BTM8KJ.p8`) lives at workspace root (gitignored). The Android service account JSON is a separate file — see Play Console setup below.

### Android Play Console setup (one-time, manual)

Before `submit:android` will work you need a Google service account key:

1. Open [Google Play Console](https://play.google.com/console) → create the Scholarmancy app (package `com.scholarmancy.app`) if not done.
2. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → Create service account.
3. Grant the service account **Release Manager** access in Play Console → Setup → API access.
4. Download the JSON key → save it somewhere outside of git (e.g. `~/keys/play-service-account.json`).
5. Export `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` pointing to that file before running `submit:android`.

**Track promotion path:** internal → closed testing (≥12 opted-in testers × 14 days if NoctuSoft Inc is a personal account created after Nov 13, 2023) → production with staged rollout (≤20% to start).

**API level:** SDK 57 targets Android API 36 by default — compliant with the Aug 31, 2026 Play deadline. No additional configuration needed.

**Data Safety form:** fill it in Play Console to match what `expo-updates`, `expo-notifications`, and `expo-secure-store` actually collect. Update it any time a new SDK is added.

## Shipping backend/web (Railway)

**Just push to main.** The pipeline is:
push → dev auto-deploys instantly → CI Gate + dev-commit-verification + Playwright E2E run → **production deploys only when every check is green** (Railway check-suites on the production triggers).

- Do NOT re-add `railway up` to workflows (per-env project tokens; never worked).
- Do NOT disable `checkSuites` on production deployment triggers — that removes the prod gate.
- Verify what's deployed: `curl <host>/api/health/version` reports the git SHA on both API and web, prod and dev.
- Emergency bypass: `gh workflow run deploy.yml -f skip_e2e=true` (break-glass only).

## Hard invariants (each one broke production or CI when violated)

- **Mobile: the URL API is banned** — RN's polyfill is http(s)-only and never throws. Use `packages/mobile/src/utils/urlNormalize.ts` string helpers.
- **Never cache signed asset URLs or materials responses** (24h TTL) — fetch per mount.
- **API: sign asset URLs via `resolveApiBaseUrl()`** (`attachmentSigning.ts`), never `config.baseUrl` — that is the *web* origin and silently produces wrong-host/unmatched URLs.
- **Mobile unit tests must never hit the network** — the `apiClient` singleton defaults to the production API when `EXPO_PUBLIC_API_URL` is unset; mock `fetch` or the client method.
- **Coverage thresholds in `packages/mobile/jest.config.js` never go down.**
- New workspace packages must be added to the `COPY packages/<name>/package.json` lists in `Dockerfile.api` AND `Dockerfile.workers`, or Railway builds fail.
- `companionDevSeed.generated.ts` is generated (metro locally, ensure-script in CI) — never commit it, never import it without the ensure-script path.
- Grades course ids are merged 12-char hashes; action-board ids are raw — **never join grades↔action-board on courseExternalId**; only `assignmentExternalId` is raw in both.
- pnpm version comes from `packageManager` in root package.json only — never pin it in workflows or Dockerfiles independently.
