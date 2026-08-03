# Scholaracle Coverage Gaps — Spec ↔ Test Matrix

**Status:** v1 (Phase 2 of QA audit) — 2026-04-28
**Sources audited:** `APP_SPECIFICATION.md`, `SUPER_ADMIN_DASHBOARD_SPECIFICATION.md`, `E2E_FAIL_FAST_PYRAMID.md`, `AUTOMATION_TESTABILITY.md`.
**Test inventory:** 31 Playwright spec files (`packages/e2e/tests/`, ~227 `test()` blocks). Unit/integration: 129 suites / 1174 tests (per memory).

Legend: ✅ covered  ⚠️ partial  ❌ missing.
Citations are `file:line` for first relevant test or `—` when none exists.

---

## 1. Parent Web App (APP_SPEC §1.1)

| Spec area | IDs | Status | Evidence |
|-----------|-----|--------|----------|
| Register → land on `/dashboard` | INT-001 | ✅ | `packages/e2e/tests/05-integration.spec.ts:1-100` (INT-001); `tests/auth/registration.spec.ts:1` (9 tests) |
| Login / logout | AUTH-001/002 | ✅ | `tests/01-auth.spec.ts:1-127`; `tests/auth/login.spec.ts`, `tests/auth/logout.spec.ts` |
| Auth guard `/dashboard/**` | — | ⚠️ | `tests/06-error.spec.ts:70` (ERR-004) covers admin only; no parent-side guard test for protected route by direct URL |
| Dashboard KPI cards | DASH-P-001 | ✅ | `tests/02-dashboard-parent.spec.ts:1-190` (12 tests) |
| `data-testid="student-count"` | — | ⚠️ | rendered but only a presence check, no value assertion under N students |
| `/dashboard/courses` route | DASH-P-? | ✅ | `tests/02-dashboard-parent.spec.ts` |
| Student CRUD | FEAT-P-001..004 | ✅ | `tests/04-feature-parent.spec.ts:14-91` |
| Student validation: empty name, 200-char name, XSS | — | ❌ | no boundary/negative tests |
| Alerts list / acknowledge / filter | FEAT-P-005..007 | ✅ | `tests/04-feature-parent.spec.ts:92-139` |
| Alert: re-acknowledge, ack with stale token, ack of other-parent's alert | — | ❌ | no negatives — see RISK-002 |
| Settings notif/thresholds + persist | FEAT-P-008..010 | ✅ | `tests/04-feature-parent.spec.ts:140-225` |
| Settings: concurrent edit / out-of-range threshold | — | ❌ | none |
| Student "view" sub-routes (`/view`, `/view/agenda`, `/view/alerts`, `/view/courses`) | — | ⚠️ | `tests/10-pages-gaps.spec.ts:1-65` (6 tests) — render only, no content assertions |
| Onboarding wizard | INT-001 | ⚠️ | `tests/07-onboarding-wizard.spec.ts:1-401` (9 tests) — linear happy path; no refresh-mid-wizard, back-button, validation-back, abandon-resume |

## 2. Admin Dashboard (APP_SPEC §1.2 + SUPER_ADMIN_SPEC)

| Spec area | IDs | Status | Evidence |
|-----------|-----|--------|----------|
| Admin login → `/admin/dashboard` | AUTH-003, DASH-A-001 | ✅ | `tests/auth/admin-auth.spec.ts` (4 tests); `tests/02-dashboard-admin.spec.ts:1-152` (13 tests) |
| **Admin MFA setup / verify / backup codes** (SUPER §5.1) | — | ❌ | RISK-003. No TOTP/speakeasy in any e2e |
| Customer list — search, filter (plan/status/date), pagination | FEAT-A-001..004, NAV-A-015 | ⚠️ | `tests/04-feature-admin.spec.ts:1-499` (20 tests) — search and pagination yes; multi-filter combos no |
| Customer detail tabs (Overview/Subscription/Payments/Students/Comm/Notes) | NAV-A-010 | ⚠️ | tab clicks asserted; per-tab content assertions thin |
| Suspend / unsuspend | FEAT-A-005/006 | ✅ | `tests/04-feature-admin.spec.ts` |
| Admin notes CRUD | FEAT-A-010..012 | ✅ | same file |
| Send communication | FEAT-A-013, INT-004 | ⚠️ | UI submit covered; delivery-status webhook (Twilio/SendGrid) round-trip not asserted in e2e |
| **Subscription plan change / cancel / reactivate / extend trial** | FEAT-A-007/008, INT-003 | ⚠️ | only one transition tested; reactivation, extend-trial, past_due → active untested |
| **Refund** | FEAT-A-009 | ⚠️ | unit `billing.test.ts` exists; no admin-UI E2E refund flow with Stripe webhook round-trip |
| **Customer impersonation** (SUPER §4.2) | — | ❌ | RISK-015. No e2e |
| Analytics / Reports / Audit-Log pages | DASH-A-007/009/010 | ⚠️ | render checks only (`tests/02-dashboard-admin.spec.ts`); no chart-data, no export, no filter |
| Admin user CRUD | FEAT-A-014/015 | ✅ | `tests/04-feature-admin.spec.ts` |

## 3. Cross-cutting / Money / Webhooks

| Area | Status | Evidence | Gap |
|------|--------|----------|-----|
| Stripe/Square webhook signature validation | ⚠️ | `packages/api/src/routes/webhooks/square/squareWebhook.test.ts` exists | 0 `test()` matches in grep — file may be empty/disabled. Verify and expand. |
| Webhook idempotency / replay | ❌ | — | RISK-001 |
| Twilio inbound webhook | ⚠️ | `packages/api/src/routes/webhooks/twilio/twilio-webhook.test.ts` | also 0 matches found; signature middleware exists |
| Communication delivery status (sent → delivered → opened → clicked) | ❌ | — | RISK-009 |
| Connector token refresh on 401 | ❌ | — | RISK-010 |
| IDOR / cross-tenant `/api/*/:id` | ❌ | — | RISK-002 |
| JWT refresh under concurrency | ❌ | `tests/auth/refresh.spec.ts` (2 tests, single-thread) | RISK-004 |
| Password reset token reuse / expiry | ⚠️ | `tests/auth/forgot-password.spec.ts` (5), `tests/auth/reset-password.spec.ts` (4) | no reuse / expiry / cross-account negatives |
| Audit-log completeness across admin mutations | ⚠️ | `database/src/repositories/AuditLogRepository/AuditLogRepository.test.ts` | no parameterised "every admin mutation writes a log" sweep |

## 4. Blended Family / Multi-Parent

| Area | Status | Evidence | Gap |
|------|--------|----------|-----|
| Add second parent to student | ✅ | `tests/08-multi-parent.spec.ts:1-399` (7 tests); `tests/12-blended-family-contacts.spec.ts:1-222` (5 tests) | — |
| Revoke parent — verify lost access | ❌ | — | RISK-005 |
| Step-parent read-only role | ❌ | — | RISK-005 |
| Notification routing per parent contact prefs | ⚠️ | unit-level in `agents` (`PersonalizedNotificationService.test.ts`) | no e2e asserting which parent received which channel |

## 5. UX / Accessibility / Performance / Non-functional

| Area | Status | Evidence | Gap |
|------|--------|----------|-----|
| WCAG 2.2 AA (axe-core) | ❌ | grep "axe" → 0 in test source | RISK-011 |
| Keyboard-only navigation (Fitts/Hick) | ❌ | — | none |
| Color-contrast / focus ring | ❌ | — | none |
| Lighthouse CI (LCP / CLS / INP) | ❌ | — | RISK-012 |
| k6 / load on `/api/alerts`, `/api/digest` | ❌ | — | RISK-012 |
| Visual regression | ❌ | — | none |
| i18n long-string / RTL | ❌ | — | RISK-017 |
| Slow-3G / throttle | ❌ | — | RISK-014 |
| Offline degradation | ⚠️ | `tests/06-error.spec.ts:101` ERR-006 | single page; no offline-mutation queue |
| Empty states (zero students, zero alerts) | ⚠️ | implicit in dashboard tests | not asserted explicitly |
| Loading / skeleton transitions | ❌ | — | none; AUTOMATION_TESTABILITY mandates non-unmount |
| Console error sweep across all pages | ⚠️ | only `tests/00-critical.spec.ts:121` | RISK-020 |
| Mobile viewport / responsive | ❌ | Chromium-desktop only | RISK-019 |

## 6. Scraper / Generation Flows

| Area | Status | Evidence | Gap |
|------|--------|----------|-----|
| Scraper generation E2E | ✅ | `tests/scraper-generation-e2e.spec.ts` (8 tests), `tests/scraper-ai-generation.spec.ts` (2), `tests/complete-scraper-flow.spec.ts` (6), `tests/scraper-ux-multi-student.spec.ts` (6) | — |
| Server sync | ✅ | `tests/server-sync-e2e.spec.ts` (10 tests) | — |
| Failure / retry / partial-success paths | ❌ | — | none asserts retry budget |
| Credential encryption-at-rest | ❌ | — | RISK-010 |

---

## Top-5 Most Urgent Coverage Gaps

1. **Webhook idempotency + refund round-trip** (Stripe/Square) — RISK-001/007. Money-critical, zero E2E.
2. **Cross-tenant IDOR sweep** on `/api/students/:id`, `/api/alerts/:id`, `/api/admin/customers/:id` — RISK-002.
3. **Admin MFA E2E** with speakeasy TOTP — RISK-003.
4. **Blended-family revocation ACL** (parent removed → access denied) — RISK-005.
5. **A11y baseline** — adopt `@axe-core/playwright` and gate all parent-facing pages — RISK-011.
