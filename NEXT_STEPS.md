# Scholaracle Testing — Next Steps

**First written:** 2026-04-28 (Phase 4 of the QA audit)
**Checked against the code:** 2026-11-26
**Owner:** QA / Eng leadership

This file lists the test tooling that was proposed in April, what exists today, and what is still to do. Each status below was checked in the repo on the date above.

---

## Running the Phase 4 specs

Nothing special is needed any more. `@axe-core/playwright` is a normal dev dependency of `packages/e2e`, so `pnpm install` at the repo root installs it.

```bash
pnpm --filter @scholaracle/e2e test:e2e -g "@a11y"
pnpm --filter @scholaracle/e2e test:e2e -g "@security"
pnpm --filter @scholaracle/e2e test:e2e -g "@auth"
pnpm --filter @scholaracle/api test
```

---

## The April list, with today's status

| # | Item | Status | What is left |
|---|------|--------|--------------|
| 1 | axe-core baseline | Started | Used in `14-a11y-baseline.spec.ts` and `16-admin-mfa.spec.ts`. Not yet on every signed-in page, and no CI job fails on a serious violation. |
| 2 | Lighthouse CI | Config only | `.lighthouserc.json` exists. `@lhci/cli` is not installed and no workflow runs it. |
| 3 | k6 load smoke | Script only | `packages/api/load/k6/smoke.js` and its README exist. Run on demand; no workflow runs it. |
| 4 | MSW for web tests | Not started | Web jest tests still stub `fetch` by hand. |
| 5 | Visual regression | Not started | No Percy or Chromatic. |
| 6 | Webhook replay hardening | Twilio done, store half done | See below. |
| 7 | Concurrent JWT refresh test | Not started | RISK-004 is still open. |
| 8 | Admin impersonation audit | Partly covered | See below. |
| 9 | Phone-width E2E | One project | See below. |
| 10 | Shared test app helper | Started | `createTestApp` exists and 5 of 161 API test files use it (DEF-005). |

### 1. axe-core baseline expansion — **Effort: S (½ day)**

- Wire `expectNoA11yViolations` into every signed-in page (action board, billing, settings sub-pages, integrations).
- Gate CI: fail the e2e job on any `serious` or `critical` violation.
- Triage the first run; suppress only with a documented reason in `helpers/a11y.ts` defaults.

### 2. Lighthouse CI for Core Web Vitals — **Effort: M (1 day)**

- Targets per spec §8: LCP < 2.5 s, CLS < 0.1, INP < 200 ms, TBT < 200 ms.
- `.lighthouserc.json` holds the budgets. Still to do: `pnpm add -Dw @lhci/cli` and a workflow that runs `lhci autorun` against `/dashboard`, `/dashboard/alerts` and `/admin/dashboard` after seed, on PRs and nightly on `main`.

### 3. k6 load smoke for hot paths — **Effort: M (1 day)**

- Targets: `/api/alerts` (list and by id), `/api/digest` (worker enqueue path).
- Scenarios: 20 VU steady, 60 VU spike. SLO: p95 < 250 ms list, < 100 ms by id.
- `packages/api/load/k6/smoke.js` is the starting point. Install k6 with `brew install k6`. Keep it on demand, not blocking.

### 4. MSW for web client API tests — **Effort: M (1 day)**

- Replaces hand-written `fetch` spies in `packages/web` jest tests with declared request handlers.
- Better coverage of error, empty and slow responses.
- Install: `pnpm --filter @scholaracle/web add -D msw`.

### 5. Visual regression (Percy or Chromatic) — **Effort: M-L (1-2 days)**

- One snapshot per major page on Chromium and WebKit, at desktop and phone width.
- Both free tiers cover about 5,000 screenshots a month. Percy fits Playwright more closely.
- Install (Percy): `pnpm --filter @scholaracle/e2e add -D @percy/cli @percy/playwright`.

### 6. Webhook replay hardening — **Effort: S (½ day)**

- **Twilio: done.** `twilio-replay-window.middleware.ts` rejects a request older than its window (`maxAgeMs`), and the route records each event through `WebhookEventRepository`. Both have tests.
- **Noctusoft store: half done.** `noctusoftWebhook.test.ts` covers the signature, event-id dedupe and refunds (DEF-001, DEF-002). Still to add: a timestamp window, so a signed event replayed long after it was sent is refused before the dedupe lookup.

### 7. Concurrent JWT refresh test — **Effort: S (½ day)**

- RISK-004. Use `Promise.all([refresh, refresh, refresh])` against `/api/auth/refresh` and assert exactly one succeeds (token rotation).
- Add to `packages/e2e/tests/auth/refresh.spec.ts` or as a Jest API test.

### 8. Admin impersonation audit — **Effort: S (½ day) for what is left**

- RISK-015. Covered today:
  - `IMPERSONATE-ASSURANCE-001` in `packages/api/src/routes/admin/customers/customers.test.ts`: starting impersonation writes an audit row, and the parent token it returns cannot call admin APIs.
  - `FEAT-A-016` in `packages/e2e/tests/04-feature-admin.spec.ts`: the button on the customer page opens the impersonate page.
- Not covered: the automatic timeout (spec §4.2), and a mark on the impersonated parent's own changes that says an admin made them.

### 9. Phone-width E2E — **Effort: S (½ day)**

- RISK-019. One Playwright project runs at phone width: `studio` (`devices['iPhone 13']` on Chromium), and it runs `18-studio.spec.ts` only.
- The parent side has no E2E at phone width. The phone-width fixes of 25–26 Nov 2026 (Sign in on the home page, the Feedback button moving into the menu below 768 px) are covered by jest tests and were checked by hand in a browser, not by Playwright.
- Next: a `mobile-chromium` project that runs a smoke subset tagged `@mobile` on PRs: home page, sign in, dashboard, the Add student wizard through "Done connecting", Support.

### 10. Test infra cleanup — **Effort: M (1 day)**

- DEF-005. `packages/api/src/test-utils/createTestApp.ts` exists. Move the remaining API suites to it as they are touched.
- When a suite builds its own app, pass the same `jwtSecret` to every router. On 26 Nov 2026 the agenda router was found to ignore the server's secret (DEF-014), which no suite caught because none ran the agenda through `createApp`.

---

## Phase 4 file inventory

| Layer | File | Purpose |
|-------|------|---------|
| e2e helper | `packages/e2e/helpers/a11y.ts` | axe-core wrapper |
| e2e package.json | `packages/e2e/package.json` | Added `@axe-core/playwright` devDep |
| e2e spec | `packages/e2e/tests/14-a11y-baseline.spec.ts` | 8 a11y tests |
| e2e spec | `packages/e2e/tests/15-blended-family-revocation.spec.ts` | 5 revocation tests |
| e2e spec | `packages/e2e/tests/16-admin-mfa.spec.ts` | 5 MFA tests |
| e2e spec | `packages/e2e/tests/17-cross-tenant-idor.spec.ts` | 6 IDOR tests |
| api spec | `packages/api/src/routes/webhooks/noctusoft/noctusoftWebhook.test.ts` | Store webhook: signature, event-id dedupe, grants, refunds, cancel (replaced the Square suite) |
| api spec | `packages/api/src/routes/students/students.idor.test.ts` | 6 student route IDOR tests |
| docs | `UX_REPORT.md` | Heuristic sweep |
| docs | `DEFECTS.md` | Defects with regression-test pointers |
| docs | `NEXT_STEPS.md` | This file |

**Phase 4 total:** 8 + 5 + 5 + 6 + 5 + 6 = **35 new tests across 6 spec files**.

---

## Open questions

1. **Admin MFA window** (DEF-010) — decided in code: `window: 2` in `packages/auth/src/MFAService/MFAService.ts`, which accepts a code up to 60 seconds old. `ADMIN-MFA-004` still accepts either 200 or 401 for a code from the previous step. Tighten it to 200.
2. **`/api/seed/add-parent`** sets the invite to `accepted` at once. Fine for E2E, since it skips the real invite and accept. Product has not confirmed it.
3. **What a revoked user sees** (BFR-005, IDOR-006) — the API answers 404. Design has to choose 404 or 403, and the page should say it in plain words.
4. **Refund and the subscription** (DEF-002) — does a full refund inside the trial cancel the subscription, or only mark the payment refunded? The spec does not say.
