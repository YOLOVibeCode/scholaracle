# Scholaracle Risk Register

**Status:** v1 (Phase 1 of QA audit) — generated 2026-04-28
**Scoring:** Severity = Sev-1 (catastrophic) → Sev-4 (cosmetic).
Score = Impact (1-5) × Likelihood (1-5) × (6 − Detectability 1-5). Higher = worse.
"Detectability" = how likely existing tests/monitoring catch it (5 = obvious in CI, 1 = silent in prod).

Sorted highest score first. File:line references point at the surface area, not necessarily the bug.

| # | ID | Sev | Area | Risk | I | L | D | Score | Existing Coverage | Notes / Hypothesis |
|---|----|-----|------|------|---|---|---|-------|-------------------|--------------------|
| 1 | RISK-001 | Sev-1 | Billing / Money | **Stripe (Square) webhook idempotency / replay.** A duplicate `invoice.paid` or `payment.refunded` event could double-credit, double-cancel, or skip a refund. No replay/idempotency-key E2E test exists. | 5 | 4 | 1 | 100 | Unit test only: `packages/api/src/routes/webhooks/square/squareWebhook.test.ts` (file present, 0 `test()` matches found). No E2E. | Verify `event.id` dedup table + transactional state machine. Add replay test fixture. |
| 2 | RISK-002 | Sev-1 | Multi-tenant Isolation | **Cross-tenant data leak via direct ID access** (`/api/students/:id`, `/api/alerts/:id`, `/api/admin/customers/:id`). One parent could read another's student if `userId` not enforced server-side. | 5 | 4 | 2 | 80 | No negative-auth test for IDOR found in `04-feature-parent.spec.ts:1-225`. | Per-route ownership middleware audit + IDOR sweep test. |
| 3 | RISK-003 | Sev-1 | Auth | **Admin MFA/TOTP not exercised in E2E.** Spec §5.1 requires mandatory MFA; only `auth/admin-auth.spec.ts` (4 tests) exists, no speakeasy TOTP path. | 5 | 4 | 2 | 80 | `packages/e2e/tests/auth/admin-auth.spec.ts` (4 tests), no TOTP setup/verify flow. | Add MFA enroll → verify → backup-code path. |
| 4 | RISK-004 | Sev-1 | Auth | **JWT refresh / expiry races.** Known flake in `customers.test.ts` and `auth.test.ts` indicates real expiry boundary issues. Refresh-token rotation not tested under concurrent requests. | 5 | 4 | 2 | 80 | `packages/e2e/tests/auth/refresh.spec.ts` (2 tests); known flaky. | Add concurrent-refresh + rotated-token-replay test. |
| 5 | RISK-005 | Sev-1 | Blended Family | **Permission matrix for co-parents / guardians.** `ManageParentsCard.tsx` and `08-multi-parent.spec.ts` (7 tests) cover happy path; spec for revoked-parent / step-parent read-only access is implicit. | 4 | 5 | 2 | 80 | `12-blended-family-contacts.spec.ts` (5 tests) + `08-multi-parent.spec.ts` (7 tests). No "revoke after share" or "ex-spouse cannot read" test. | Verify ACL on alert/student detail after parent removal. |
| 6 | RISK-006 | Sev-1 | PII / Privacy | **PII leak in audit logs / communication logs.** Spec §5.3 requires masking; no test asserts that `last4`, full email, phone are masked in `/admin/communications` or `/admin/audit-logs` UI. | 5 | 3 | 2 | 60 | None in e2e. `AuditLogRepository.test.ts` covers persistence not redaction. | Add snapshot/regex test for masking. |
| 7 | RISK-007 | Sev-1 | Billing / UX | **Subscription state machine drift** (trialing → past_due → active → cancelled). `INT-003` only exercises one happy path. Past-due dunning UX, grace period, reactivation are untested. | 4 | 4 | 2 | 64 | `05-integration.spec.ts` INT-003 (single flow). | Stub Stripe events for each transition; add admin-side assertion. |
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

## Top-5 Distilled

1. **Webhook idempotency / money** (RISK-001) — no replay test, double-charge possible.
2. **Cross-tenant IDOR** (RISK-002) — no negative-auth coverage on resource-by-id routes.
3. **Admin MFA path** (RISK-003) — mandatory per spec, untested end-to-end.
4. **JWT refresh races** (RISK-004) — already known flaky in unit tests.
5. **Blended-family ACL after revocation** (RISK-005) — happy path only.
