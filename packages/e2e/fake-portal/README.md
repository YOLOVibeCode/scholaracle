# Fake portal (Aeries + Skyward)

Implementation: [`scripts/fake-portal-server.mjs`](../../../scripts/fake-portal-server.mjs) (Node `http`, strict CSP, credentials `demo` / `demo`).

Shared HTML and expected counts: `@scholaracle/scraper-core` → `src/fixtures/fakePortalM402.ts`.

## Run

```bash
pnpm --filter @scholaracle/contracts build
pnpm --filter @scholaracle/logger build
pnpm --filter @scholaracle/scraper-core build
FAKE_PORTAL_STRICT_CSP=1 FAKE_PORTAL_PORT=2855 node scripts/fake-portal-server.mjs
```

## Playwright

From `packages/e2e`:

```bash
pnpm run test:fake-portal
```
