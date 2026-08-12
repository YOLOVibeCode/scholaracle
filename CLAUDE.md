# Scholaracle — operating rules

PNPM monorepo. Ports: 2800 web / 2801 api / 2802 mongo. Stack: TS strict, Express 4, MongoDB, Next.js 16, Expo SDK 57 / RN 0.86.

## Shipping the mobile app (TestFlight)

From `packages/mobile`, always in this order:

```bash
pnpm build:ios     # preflight (doctor + version check + bundle export) THEN eas build
pnpm submit:ios    # push latest build to TestFlight (non-interactive, ASC key in eas.json)
```

- **Never call `eas build` directly** — `build:ios` exists so a build cannot start without preflight. If preflight fails, fix it first; each skipped preflight historically cost a full remote build to discover the same error.
- Build numbers auto-increment (`appVersionSource: remote`). Total build time is ~5 min.

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
