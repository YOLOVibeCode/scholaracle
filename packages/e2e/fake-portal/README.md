# Fake portal (Aeries + Skyward)

TypeScript HTTP server (same routes as the M4-08 spec; Express can replace the handler when the lockfile adds `express`) on port **2855** (override `FAKE_PORTAL_PORT` / `PORT`). Credentials **`demo` / `demo`**. Strict CSP when `FAKE_PORTAL_STRICT_CSP=1` or `?csp=strict`.

Shared HTML and expected counts: `@scholaracle/scraper-core` → `src/fixtures/fakePortalM402.ts`.

## Run

```bash
pnpm --filter @scholaracle/contracts build
pnpm --filter @scholaracle/logger build
pnpm --filter @scholaracle/scraper-core build
pnpm --filter @scholaracle/e2e run fake-portal:build
FAKE_PORTAL_STRICT_CSP=1 FAKE_PORTAL_PORT=2855 pnpm --filter @scholaracle/e2e run fake-portal:start
```

## Playwright

From `packages/e2e`:

```bash
pnpm run test:fake-portal
```

## Smoke (CSP header)

```bash
curl -sI "http://127.0.0.1:2855/fake-aeries/student/LoginParent.aspx?csp=strict" | grep -i content-security-policy
```
