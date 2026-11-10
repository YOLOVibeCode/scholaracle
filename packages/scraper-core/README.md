# @scholaracle/scraper-core

Runtime-agnostic scraper recipes, page functions, selector tables, and transformers shared by the CLI (`scraper-playwright`), mobile WebView, browser extension, and jsdom replay tests.

## Fake portal conformance

The M4-02 fake Aeries/Skyward portal (`scripts/fake-portal-server.mjs`, port **2855**) exercises the same recipes on every host driver. Expected extraction counts live in:

- [`src/fixtures/fakePortalM402.ts`](src/fixtures/fakePortalM402.ts) — HTML builders and golden count constants
- [`src/fixtures/fakePortalConformance.ts`](src/fixtures/fakePortalConformance.ts) — `FAKE_PORTAL_RECIPE_CONFORMANCE` table and shared `assertFakePortal*` helpers

**A new recipe must be added to `FAKE_PORTAL_RECIPE_CONFORMANCE`**, together with its fake-portal pages, golden counts, an `assertFakePortal*` helper, and jsdom fixtures in `buildFakePortalJsdomFixtures`, so that every driver below runs it.

**When you add or materially change an Aeries or Skyward recipe step**, update the golden constants in `fakePortalM402.ts` and ensure the conformance table still lists the recipe. Three surfaces must stay aligned:

| Driver | Where it is tested |
| --- | --- |
| Playwright | `packages/e2e/tests/fake-portal-recipes.spec.ts` |
| Extension `ContentScriptPageDriver` | `packages/e2e/tests/fake-portal-recipes-extension.spec.ts` |
| jsdom replay | `src/fixtures/fakePortalConformance.replay.test.ts` |

Run locally:

```bash
pnpm --filter @scholaracle/scraper-core test -- fakePortalConformance
pnpm --filter @scholaracle/e2e run test:fake-portal
```

Deployed Playwright runs skip specs tagged `@local-only`.
