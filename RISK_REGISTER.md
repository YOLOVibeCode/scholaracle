# Scholaracle Risk Register

**Status:** v1 (Phase 1 of QA audit) — generated 2026-04-28. Coverage re-checked 2026-11-26: see "Changes since April" below the table. The table itself is the April assessment and its scores have not been recomputed.
**Scoring:** Severity = Sev-1 (catastrophic) → Sev-4 (cosmetic).
Score = Impact (1-5) × Likelihood (1-5) × (6 − Detectability 1-5). Higher = worse.
"Detectability" = how likely existing tests/monitoring catch it (5 = obvious in CI, 1 = silent in prod).

Sorted highest score first. File:line references point at the surface area, not necessarily the bug.

| # | ID | Sev | Area | Risk | I | L | D | Score | Existing Coverage | Notes / Hypothesis |
|---|----|-----|------|------|---|---|---|-------|-------------------|--------------------|
| 1 | RISK-001 | Sev-1 | Billing / Money | **Store webhook idempotency / replay.** A duplicate `subscription.renewed` or `purchase.refunded` event could double-credit, double-cancel, or skip a refund. Square was removed (#24). | 5 | 4 | 1 | 100 | Unit tests: `packages/api/src/routes/webhooks/noctusoft/noctusoftWebhook.test.ts` (event-id dedupe, refund skip by refund ref). No E2E. | Verify `event.id` dedup table + transactional state machine. Add replay test fixture. |
| 2 | RISK-002 | Sev-1 | Multi-tenant Isolation | **Cross-tenant data leak via direct ID access** (`/api/students/:id`, `/api/alerts/:id`, `/api/admin/customers/:id`). One parent could read another's student if `userId` not enforced server-side. | 5 | 4 | 2 | 80 | No negative-auth test for IDOR found in `04-feature-parent.spec.ts:1-225`. | Per-route ownership middleware audit + IDOR sweep test. |
| 3 | RISK-003 | Sev-1 | Auth | **Admin MFA/TOTP not exercised in E2E.** Spec §5.1 requires mandatory MFA; only `auth/admin-auth.spec.ts` (4 tests) exists, no speakeasy TOTP path. | 5 | 4 | 2 | 80 | `packages/e2e/tests/auth/admin-auth.spec.ts` (4 tests), no TOTP setup/verify flow. | Add MFA enroll → verify → backup-code path. |
| 4 | RISK-004 | Sev-1 | Auth | **JWT refresh / expiry races.** Known flake in `customers.test.ts` and `auth.test.ts` indicates real expiry boundary issues. Refresh-token rotation not tested under concurrent requests. | 5 | 4 | 2 | 80 | `packages/e2e/tests/auth/refresh.spec.ts` (2 tests); known flaky. | Add concurrent-refresh + rotated-token-replay test. |
| 5 | RISK-005 | Sev-1 | Blended Family | **Permission matrix for co-parents / guardians.** `ManageParentsCard.tsx` and `08-multi-parent.spec.ts` (7 tests) cover happy path; spec for revoked-parent / step-parent read-only access is implicit. | 4 | 5 | 2 | 80 | `12-blended-family-contacts.spec.ts` (5 tests) + `08-multi-parent.spec.ts` (7 tests). No "revoke after share" or "ex-spouse cannot read" test. | Verify ACL on alert/student detail after parent removal. |
| 6 | RISK-006 | Sev-1 | PII / Privacy | **PII leak in audit logs / communication logs.** Spec §5.3 requires masking; no test asserts that `last4`, full email, phone are masked in `/admin/communications` or `/admin/audit-logs` UI. | 5 | 3 | 2 | 60 | None in e2e. `AuditLogRepository.test.ts` covers persistence not redaction. | Add snapshot/regex test for masking. |
| 7 | RISK-007 | Sev-1 | Billing / UX | **Subscription state machine drift** (trialing → past_due → active → cancelled). `INT-003` only exercises one happy path. Past-due dunning UX, grace period, reactivation are untested. | 4 | 4 | 2 | 64 | `05-integration.spec.ts` INT-003 (single flow). | Stub store events for each transition; add admin-side assertion. |
| 8 | RISK-008 | Sev-2 | Onboarding Wizard | **Wizard state loss on refresh / back-button.** 9 tests in `07-onboarding-wizard.spec.ts` cover linear path; no resume-after-refresh, no validation-on-back. | 4 | 4 | 2 | 64 | `packages/e2e/tests/07-onboarding-wizard.spec.ts:1-401`. | Add reload mid-step + browser-back tests. |
| 9 | RISK-009 | Sev-2 | Alerts / Digest Pipeline | **Digest worker silent failure.** Only `packages/workers` has 1 suite/13 tests. No E2E asserting "seeded alert ⇒ digest email queued ⇒ delivered status updates". `13-full-ux-alert-email.spec.ts` (2 tests) is shallow. | 4 | 4 | 2 | 64 | `13-full-ux-alert-email.spec.ts` (2 tests); workers suite. | Add end-to-end with mocked SendGrid + status assertion. |
| 10 | RISK-010 | Sev-2 | Scraper / Connector | **Canvas/Skyward credential storage + token refresh.** Connector adapter tests are unit-mocked (`packages/connector/src/adapter.test.ts`). No test for encrypted-at-rest or token-refresh-on-401. | 4 | 3 | 2 | 48 | `connector/src/adapter.test.ts`, `ConnectorTokenService.test.ts`. | Add 401 retry + key rotation. |
| 11 | RISK-011 | Sev-2 | Accessibility (WCAG 2.2 AA) | **Zero a11y assertions across 114 e2e tests.** No axe-core, no role/name keyboard sweeps. Onboarding wizard, dashboard, action board untested for screen readers. | 4 | 5 | 1 | 100 | `grep -ri axe` → 0 hits in test source. | Adopt @axe-core/playwright; budget per-page violations. |
| 12 | RISK-012 | Sev-2 | Performance | **No performance budgets / load tests.** Spec §8 targets <2s admin load; no Lighthouse CI, no k6 against `/api/alerts` or `/api/digest`. | 3 | 4 | 1 | 60 | None. | Add Lighthouse CI + k6 smoke. |
| 13 | RISK-013 | Sev-2 | Auth | **Password reset token reuse / expiry.** `forgot-password.spec.ts` (5) + `reset-password.spec.ts` (4) + `reset-password-success.spec.ts` (2) cover happy paths. No reuse-after-success, no expired-token, no cross-account token replay. | 4 | 3 | 2 | 48 | `packages/e2e/tests/auth/forgot-password.spec.ts`, `.../reset-password.spec.ts`. | Add 3 negatives. |
| 14 | RISK-014 | Sev-2 | UX / Empty & Error States | **Empty / loading / offline / slow-3G states unverified.** Only `ERR-006` does offline (1 test). No throttle test, no skeleton-to-table transition test. | 3 | 4 | 2 | 48 | `06-error.spec.ts:101` ERR-006. | Add slow-3G + skeleton snapshot per major page. |
| 15 | RISK-015 | Sev-2 | Admin Impersonation | **`/api/admin/customers/:id/impersonate`** spec'd but no E2E coverage; high blast-radius if scoped wrong (admin reads parent JWT). | 5 | 2 | 2 | 40 | None found. | Add audit-log + scope-limit test. |
| 16 | RISK-016 | Sev-3 | Settings Persistence | Notification toggles and thresholds: `FEAT-P-008/009/010` cover save+reload. No cross-device / concurrent edit / stale-write test. | 3 | 3 | 3 | 27 | `04-feature-parent.spec.ts:140-225`. | Optimistic-concurrency test. |
| 17 | RISK-017 | Sev-3 | i18n / Long strings | UI not tested with long names ("María-José O'Sullivan-Smith"), RTL, or 50-char school names. | 2 | 4 | 2 | 32 | None. | Add boundary fixtures. |
| 18 | RISK-018 | Sev-3 | Audit Log Completeness | Spec §5.4 requires 100% admin-action coverage. Only `AuditLogRepository.test.ts` unit-level; no admin-action sweep that asserts "every mutation writes a log". | 4 | 3 | 2 | 48 | `database/src/repositories/AuditLogRepository/AuditLogRepository.test.ts`. | Parameterised test over admin routes. |
| 19 | RISK-019 | Sev-3 | Mobile / Responsive | E2E is Chromium-desktop only (`E2E_FAIL_FAST_PYRAMID.md:124`). Mobile menu (`NAV-P-013/014`) untested. | 3 | 3 | 2 | 36 | None executed; spec lists as future. | Add mobile viewport project (gated). |
| 20 | RISK-020 | Sev-4 | Console Errors | Only `00-critical.spec.ts:121` listens for console errors; downstream layers don't. Silent React warnings accumulate. | 2 | 4 | 3 | 24 | `00-critical.spec.ts`. | Promote console-error listener to base fixture. |

## Top-5 Distilled (April)

1. **Webhook idempotency / money** (RISK-001) — no replay test, double-charge possible.
2. **Cross-tenant IDOR** (RISK-002) — no negative-auth coverage on resource-by-id routes.
3. **Admin MFA path** (RISK-003) — mandatory per spec, untested end-to-end.
4. **JWT refresh races** (RISK-004) — already known flaky in unit tests.
5. **Blended-family ACL after revocation** (RISK-005) — happy path only.

## Changes since April (checked 2026-11-26)

Where the "Existing Coverage" column above is out of date. Paths are under `packages/`.

| ID | What exists now | What is still missing |
|----|-----------------|-----------------------|
| RISK-001 | The store webhook dedupes on the event id and handles refunds (`api/src/routes/webhooks/noctusoft/noctusoftWebhook.test.ts`). | A timestamp window on the store webhook. No E2E. |
| RISK-002 | `e2e/tests/17-cross-tenant-idor.spec.ts`, `api/src/security/parentByIdRouteIdor.sweep.test.ts`, and IDOR suites for students, alerts and studio. | Nothing known. New by-id routes must join the sweep. |
| RISK-003 | `e2e/tests/16-admin-mfa.spec.ts` (5 tests). | `ADMIN-MFA-004` still accepts 200 or 401 (DEF-010). |
| RISK-004 | Unchanged. | The concurrent-refresh test. |
| RISK-005 | `e2e/tests/15-blended-family-revocation.spec.ts` (5 tests). | — |
| RISK-006 | `audit-logs.test.ts` checks that sensitive metadata fields are masked. | Masking in the communications log and in the admin UI. |
| RISK-008 | Unchanged (DEF-008). | Reload and back-button tests, after the wizard keeps its state. |
| RISK-011 | axe runs in `14-a11y-baseline.spec.ts` (8 tests) and in the MFA spec. | Every signed-in page; a CI gate. |
| RISK-012 | `.lighthouserc.json` and `api/load/k6/smoke.js` exist. | Nothing runs them. |
| RISK-015 | `IMPERSONATE-ASSURANCE-001` (audit row; the parent token cannot call admin APIs) and `FEAT-A-016`. | The automatic timeout. |
| RISK-019 | One phone-width Playwright project, `studio`, for the student side. | The parent side at phone width (see RISK-023). |
| RISK-020 | `e2e/helpers/assertions.ts` has a console listener next to the one in `00-critical.spec.ts`. | It is not in the base fixture. |

The April top five have moved: RISK-002, RISK-003 and RISK-005 now have the tests they lacked. RISK-001 and RISK-004 are still open as described.

## Added November 2026

Found in the status review of 25–26 Nov. Each row names the defect that showed the risk (`DEFECTS.md`).

| ID | Sev | Area | Risk | I | L | D | Score | Existing Coverage | Notes |
|----|-----|------|------|---|---|---|-------|-------------------|-------|
| RISK-021 | Sev-2 | Live site vs. what exists | **The site or the app offers something production cannot deliver**: a demo, a store listing, an Android app, a browser extension, alerts by text. Parents hit a dead end at the first step, or wait for a text that never comes. | 4 | 4 | 2 | 64 | Unit tests pin today's links and the demo rule (`web/lib/app-downloads.test.ts`, `web/lib/oneClickDemo.test.ts`, `api/src/routes/health/health.test.ts`). Nothing checks the live site. | DEF-011, DEF-012, DEF-013, DEF-027. A scheduled check that every outbound link on the home page, `/get-app` and `/magic` answers 200 would catch the next one. |
| RISK-022 | Sev-2 | Workers / Deploys | **State kept only in memory is lost at every deploy.** A deploy restarts the workers; anything they "remember" resets. | 3 | 5 | 2 | 60 | `workers/src/sync-staleness-monitor.test.ts` covers the one known case. | DEF-022. On 26 Nov the staleness monitor was the only cross-tick state held in memory in `packages/workers`. Keep it that way: what must survive a restart goes in the database. |
| RISK-023 | Sev-2 | Phone width | **The parent dashboard is not tested at phone width.** A fixed-position element can cover the one button a step needs. | 3 | 4 | 2 | 48 | Jest tests for the Feedback placement and the home page; checked by hand in a browser at 375 and 390 px. | DEF-021. Add the `mobile-chromium` smoke project (`NEXT_STEPS.md` item 9). |
| RISK-024 | Sev-2 | Configuration | **A variable that is set on one service or one environment and missing on another.** The code falls back silently and the product degrades without an error. | 3 | 4 | 1 | 60 | None. | DEF-014 (token secret), DEF-026 (`BASE_URL` on production workers), DEF-023 (a sender default on the wrong domain). `RAILWAY_DEPLOYMENT.md` lists what each service needs and what is set but used by nothing (thirteen names on 26 Nov); nothing compares it with Railway automatically. |
| RISK-025 | Sev-2 | Privacy | **Data sent to a third party to draw or load something**: a QR image service, an embedded script. | 4 | 2 | 2 | 32 | `web/components/dashboard/integrations/ConnectOnPhonePanel.test.tsx` asserts the QR is drawn on the page (with #198). | DEF-020. The Feedback widget loads from the Noctusoft store host, which is first party. |
| RISK-026 | Sev-3 | Naming | **The old product name in text people read.** The repo is Scholaracle; the product is Scholarmancy. | 2 | 4 | 3 | 24 | Tests pin the name in each email (DEF-023). | The browser extension's pages still say Scholaracle. |
| RISK-027 | Sev-1 | Auth | **Guessing a password or a code.** A route that checks a secret and does not count the wrong answers lets a caller try until one is right. | 5 | 3 | 1 | 75 | `api/src/routes/auth/signInAttemptLimit.test.ts`, `auth/src/AdminAuthService/adminCodeAttempts.test.ts`, `api/src/routes/admin/auth/codeAttempts.test.ts`. | DEF-028, DEF-029. The counts are in the API's memory: they start again at a deploy, and a second API instance would keep its own. Move them to the database before the API runs as more than one instance. `POST /api/auth/register` has no limit. Nothing tells anyone when a limit is hit. |
| RISK-028 | Sev-2 | Observability | **Nobody is told when production throws.** The API, the workers and the web report errors to Sentry when `SENTRY_DSN` is set. It is set on no service, so an error is one line in the Railway logs. | 4 | 4 | 1 | 80 | None. | Set `SENTRY_DSN` on the three services, and `NEXT_PUBLIC_SENTRY_DSN` on the web for errors in the browser. It needs a Sentry project, which is the owner's call. |
