# Scholaracle Testing — Next Steps

**Date:** 2026-04-28
**Owner:** QA / Eng leadership

This file enumerates tooling additions with effort estimates. Phase 4 added skeleton wiring; the install commands below activate it.

---

## Required to run new specs (must do first)

```bash
# from repo root — installs the @axe-core/playwright devDependency added to packages/e2e/package.json
pnpm install
```

The Phase 4 deliverables intentionally did **not** run `pnpm install`. The new
e2e spec file `tests/14-a11y-baseline.spec.ts` and helper `helpers/a11y.ts`
import `@axe-core/playwright`, which is now declared in
`packages/e2e/package.json` but not yet installed.

After install, run:

```bash
pnpm --filter @scholaracle/e2e test:e2e -g "@a11y"
pnpm --filter @scholaracle/e2e test:e2e -g "@security"
pnpm --filter @scholaracle/e2e test:e2e -g "@auth"
pnpm --filter @scholaracle/api test
```

---

## Recommended additions (ranked by ROI)

### 1. axe-core baseline expansion — **Effort: S (½ day)**
- Wire `expectNoA11yViolations` into every authenticated page (action board, billing, settings sub-pages, integrations).
- Gate CI: fail the e2e job on any `serious`/`critical` violation.
- Triage the first run; suppress only with documented reason in `helpers/a11y.ts` defaults.

### 2. Lighthouse CI for Core Web Vitals — **Effort: M (1 day)**
- Targets per spec §8: LCP<2.5s, CLS<0.1, INP<200ms, TBT<200ms.
- Add `.lighthouserc.json` with budgets and run via `lhci autorun` in a separate workflow against the `/dashboard`, `/dashboard/alerts`, `/admin/dashboard` routes after seed.
- Install: `pnpm add -Dw @lhci/cli`.
- CI: trigger on PR + nightly on `main`.

### 3. k6 load smoke for hot paths — **Effort: M (1 day)**
- Targets: `/api/alerts` (list + by-id), `/api/digest` (worker enqueue path).
- Scenarios: 20 VU steady, 60 VU spike. SLO: p95 < 250ms list, < 100ms by-id.
- Install: `brew install k6` (CI: official k6 GitHub Action).
- Place scripts in `packages/api/load/k6/*.js`; run on demand only (not blocking).

### 4. MSW for web client API tests — **Effort: M (1 day)**
- Replaces ad-hoc `fetch` spies in `packages/web` jest tests with declarative request handlers.
- Better coverage of error/empty/slow responses.
- Install: `pnpm --filter @scholaracle/web add -D msw`.

### 5. Visual regression (Percy or Chromatic) — **Effort: M-L (1-2 days)**
- One snapshot per major page on Chromium + WebKit.
- Cost: Percy free tier covers ~5,000 screenshots/mo; Chromatic free tier 5,000/mo.
- Recommend Percy for tighter Playwright integration.
- Install (Percy): `pnpm --filter @scholaracle/e2e add -D @percy/cli @percy/playwright`.

### 6. Webhook replay-and-signature hardening tests — **Effort: S (½ day)**
- Once DEF-001/002/007 are fixed, expand `squareWebhook.idempotency.test.ts`:
  - same `event.id`, two distinct `payment.id` → still single `webhook_events` row, single payment row.
  - timestamp outside replay window → 401.
- Add equivalent for Twilio webhook.

### 7. Concurrent JWT refresh test — **Effort: S (½ day)**
- RISK-004. Use `Promise.all([refresh, refresh, refresh])` against `/api/auth/refresh` and assert exactly one succeeds (token rotation).
- Add to `packages/e2e/tests/auth/refresh.spec.ts` or as Jest API test.

### 8. Admin impersonation audit — **Effort: M (1 day)**
- RISK-015. New e2e spec covering:
  - admin starts impersonation → audit log row written
  - impersonated parent's mutations carry "impersonatedBy" metadata
  - automatic timeout (spec §4.2)
  - cannot escalate to other-admin actions
- POM addition: `packages/e2e/pages/admin/impersonate.page.ts`.

### 9. Mobile viewport project — **Effort: S (½ day)**
- RISK-019. Add a `'mobile-chromium'` Playwright project in `playwright.config.ts` with `devices['Pixel 7']`.
- Tag a smoke subset with `@mobile` and run on PRs.

### 10. Test infra cleanup — **Effort: M (1 day)**
- DEF-005. Add `packages/api/src/test-utils/createTestApp.ts` and `createTestUser.ts` and progressively migrate the 32 api jest suites.

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
| api spec | `packages/api/src/routes/webhooks/square/squareWebhook.idempotency.test.ts` | 5 webhook hardening tests |
| api spec | `packages/api/src/routes/students/students.idor.test.ts` | 6 student route IDOR tests |
| docs | `UX_REPORT.md` | Heuristic sweep |
| docs | `DEFECTS.md` | 10 defects with regression-test pointers |
| docs | `NEXT_STEPS.md` | This file |

**Total new tests:** 8 + 5 + 5 + 6 + 5 + 6 = **35 new tests across 6 spec files**.

---

## Open questions to resolve before merge

1. **Admin MFA window** (DEF-010) — pin `speakeasy` window. Affects `ADMIN-MFA-004` boundary assertion.
2. **`/api/seed/add-parent`** auto-`accepted` status — confirmed by reading `seed.ts:921-925` but worth product confirmation that this short-circuit is acceptable for E2E (it bypasses real invite/accept).
3. **Forbidden UX for revoked users** (BFR-005, IDOR-006) — design needs to commit to either 404 or 403; current API returns 404. UI should match with a friendly heading.
4. **Refund subscription side-effect** (DEF-002) — does a full refund within trial cancel the subscription, or just mark the payment refunded? Spec is silent.
