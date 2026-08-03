# Scholaracle Defects — Phase 4 findings

**Date:** 2026-04-28
**Format:** ID, severity, area, repro, expected vs actual, file:line, fix hypothesis, regression test path.
**Note:** "Open question" entries are documented assumptions where the spec is silent.

---

## DEF-001 — Square webhook idempotency keys on `paymentId`, not `event.id`

- **Severity:** Sev-1
- **Area:** Billing / Money
- **Source:** RISK-001, COVERAGE_GAPS §3
- **Repro:**
  1. Square delivers an `event` with `event_id=evt_X` and `payment.id=pay_A`.
  2. Network retry redelivers what the merchant *thinks* is the same event but with `event_id=evt_X` and a *different* `payment.id=pay_B` (or a malicious replay swaps the ids).
  3. Today both deliveries are accepted because dedup is keyed only on `paymentId` (`squareWebhook.ts:140` — `findBySquarePaymentId`).
- **Expected:** Deduplicate by `event.id` first; only then by `paymentId`. Persist seen `event.id`s in a TTL collection.
- **Actual:** Distinct paymentIds always create distinct payment rows even when they share the same `event.id`.
- **File:** `packages/api/src/routes/webhooks/square/squareWebhook.ts:69-131`, dedup at `:140`.
- **Fix hypothesis:** Add `webhook_events` collection with `{ provider, eventId, processedAt }` unique index; check + insert before `handlePaymentCompleted`.
- **Regression test:** `packages/api/src/routes/webhooks/square/squareWebhook.idempotency.test.ts` — `'DEFECT-001 (open question)'` case (currently asserts the buggy state; flip when fix lands).

## DEF-002 — Refund events silently 200 with no state change

- **Severity:** Sev-1
- **Area:** Billing / Money
- **Repro:**
  1. Successful payment recorded for user `u1` (status `succeeded`).
  2. Square delivers `refund.created` for that `payment_id`.
  3. Webhook returns 200; `payments.status` remains `succeeded`; subscription untouched.
- **Expected:** Update `payments.status` to `refunded`; emit audit log; transition subscription to `cancelled` if full refund within trial/grace.
- **Actual:** Switch in `handleWebhook` only reacts to `payment.created|completed|updated` (`squareWebhook.ts:113-123`). Refunds are unhandled.
- **File:** `packages/api/src/routes/webhooks/square/squareWebhook.ts:113-123`.
- **Fix hypothesis:** Add `refund.created` and `refund.updated` branches. Update payment by `payment_id`; if `refund.amount === payment.amount`, mark `refunded`; else `partially_refunded`.
- **Regression test:** `squareWebhook.idempotency.test.ts` — `'DEFECT-002'` case.

## DEF-003 — `POST /api/alerts` accepts `studentId` from body without ownership check

- **Severity:** Sev-1
- **Area:** Multi-tenant / IDOR
- **Repro:**
  1. Authenticate as Parent B.
  2. POST `/api/alerts` with body `{ studentId: <Parent A's student id>, type: …, severity: … }`.
  3. The alert is created against Parent A's student.
- **Expected:** Verify `studentId` belongs to (or is shared with) the authenticated user before processing.
- **Actual:** `alerts.ts:78-149` validates only required fields; never touches `StudentRepository` to confirm ownership. Any auth'd user can trigger notifications/jobs against other parents' students.
- **File:** `packages/api/src/routes/alerts/alerts.ts:78-149`.
- **Fix hypothesis:** Inject `StudentRepository`; `if (!student.hasAccess(req.userId)) return 403`.
- **Regression test:** Add a Jest case to `packages/api/src/routes/alerts/alerts.test.ts` covering this. (Not yet added by Phase 4 because the route's `notificationService` is heavyweight to construct; flagged as follow-up.)

## DEF-004 — No `role="alert"` / `aria-live` on auth error banners

- **Severity:** Sev-2
- **Area:** A11y / WCAG 4.1.3
- **Repro:** Submit `/login` with bad credentials using a screen reader. Error banner appears visually but is not announced.
- **Expected:** `<div role="alert" aria-live="assertive">` so SR users hear the failure immediately.
- **Actual:** Plain `<div data-testid="message-error" className="…red…">`.
- **Files:** `packages/web/app/login/page.tsx:77-81`, `packages/web/app/register/page.tsx:67-71`, plus `forgot-password`, `reset-password` likely identical.
- **Fix hypothesis:** Add `role="alert" aria-live="assertive"` to the error wrapper. Apply same to session-expired and reset-success banners (those should be `aria-live="polite"`).
- **Regression test:** `packages/e2e/tests/14-a11y-baseline.spec.ts` — `A11Y-007` exercises the error path with axe.

## DEF-005 — Test harness coupling: route-level Jest tests duplicate setup boilerplate

- **Severity:** Sev-3 (engineering)
- **Area:** Test infra
- **Repro:** Each route Jest test re-creates `MongoClient`, `Express` app, `authService`, etc. ~50 lines of boilerplate per file. Drift causes subtle differences (e.g., one passes `baseUrl`, another doesn't).
- **Expected:** Shared `createTestApp()` helper.
- **Actual:** Pattern duplicated across `students.test.ts`, `customers.test.ts`, `alerts.test.ts`, etc.
- **Fix hypothesis:** Add `packages/api/src/test-utils/createTestApp.ts`. Out of scope for Phase 4 but called out so future tests don't keep paying the cost.
- **Regression test:** N/A.

## DEF-006 — Color-only severity indicators on alert chips

- **Severity:** Sev-1
- **Area:** A11y / WCAG 1.4.1, 1.3.1
- **Repro:** View `/dashboard/alerts` with macOS Display → Color Filters → Greyscale.
- **Expected:** Severity (Critical / Warning / Info) discernible without color (icon + text).
- **Actual:** Severity conveyed primarily by ring/background color; visually impossible without color vision.
- **File:** likely `packages/web/components/dashboard/...` alert chip — needs a dedicated audit (UX-A-01 in `UX_REPORT.md`).
- **Fix hypothesis:** Add severity icon + visually-hidden text label.
- **Regression test:** Future axe rule + visual snapshot in greyscale.

## DEF-007 — No `event.id` persistence — webhook replay attacks possible across providers

- **Severity:** Sev-1
- **Area:** Webhooks / replay attacks
- **Repro:** Capture a valid signed Square (or Twilio) webhook body + signature. Replay it 24h later — server still accepts the signature (no time-bound nonce / no event.id store).
- **Expected:** 5-minute (or configurable) timestamp window enforcement + `event.id` dedup table.
- **Actual:** Square: dedup by `payment.id` only (DEF-001). Twilio: signature middleware checks signature only, no replay window.
- **File:** `packages/api/src/routes/webhooks/twilio/twilio-signature.middleware.ts`, `…/square/squareWebhook.ts:79-99`.
- **Fix hypothesis:** Same as DEF-001 — add `webhook_events` collection.
- **Regression test:** Add `replays-after-window-rejected` test in both webhook suites once implemented.

## DEF-008 (open question) — Onboarding wizard state not persisted across refresh

- **Severity:** Sev-2
- **Area:** UX / Onboarding
- **Repro:** Start `/dashboard` add-student wizard, fill 3 of 5 steps, hard-refresh. All input lost.
- **Expected (per spec §1.1 / RISK-008):** Resume from last completed step.
- **Actual:** Lost.
- **File:** `packages/web/components/dashboard/AddStudentWizard.tsx`.
- **Fix hypothesis:** Persist wizard state to `sessionStorage` keyed by `userId + studentDraftId`; restore on mount.
- **Regression test:** Add to `07-onboarding-wizard.spec.ts` once implemented.

## DEF-009 — Seed route does not reset payments on `force=true` consistently

- **Severity:** Sev-3
- **Area:** Test infra
- **Repro:** Hit `POST /api/seed?force=true` twice. Second run reports `paymentsExisting > 0` instead of recreating.
- **Expected:** With `force=true`, all seeded entities are recreated deterministically.
- **Actual:** Some sections (admins, payments) only delete-and-recreate when `existing.length > 0` — when an unrelated test deleted them, the second seed silently uses prior state. Seed cohorts are decoupled.
- **File:** `packages/api/src/routes/seed/seed.ts:401-432`.
- **Fix hypothesis:** With `force=true`, unconditionally `deleteMany` and recreate every cohort.
- **Regression test:** Add `seed.test.ts` case asserting deterministic counts after two consecutive `force=true` calls.

## DEF-010 (open question) — Admin MFA TOTP window (drift) is undocumented

- **Severity:** Sev-3
- **Area:** Auth / Admin MFA
- **Repro:** Submit a TOTP from the previous 30s window.
- **Expected:** Spec should pin a window value (default speakeasy `window=1` accepts ±30s; some banks pin to 0 for stricter).
- **Actual:** Test `ADMIN-MFA-004` uses `expect([200, 401])` because behavior is unspecified.
- **File:** `packages/auth/src/MFAService.ts` (drift configuration).
- **Fix hypothesis:** Pin `window: 1` in MFAService and document.
- **Regression test:** `packages/e2e/tests/16-admin-mfa.spec.ts` — `ADMIN-MFA-004`.

---

## Summary

| ID | Severity | Domain | Has regression test? |
|----|----------|--------|----------------------|
| DEF-001 | Sev-1 | Webhook idempotency | yes (locked-bug assertion) |
| DEF-002 | Sev-1 | Refund handling | yes (locked-bug assertion) |
| DEF-003 | Sev-1 | IDOR / multi-tenant | partial (e2e covers GET; alerts POST followup) |
| DEF-004 | Sev-2 | A11y | yes (axe) |
| DEF-005 | Sev-3 | Test infra | no |
| DEF-006 | Sev-1 | A11y | no (visual) |
| DEF-007 | Sev-1 | Webhook replay | no (followup) |
| DEF-008 | Sev-2 | Onboarding UX | no (followup) |
| DEF-009 | Sev-3 | Seed determinism | no (followup) |
| DEF-010 | Sev-3 | MFA window | yes (tolerant) |
