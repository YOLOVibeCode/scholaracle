# Scholaracle Defects

**First written:** 2026-04-28 (Phase 4 findings, DEF-001 to DEF-010)
**Checked against the code:** 2026-11-26 (statuses below, and DEF-011 onward from the November status review)
**Format:** ID, severity, area, repro, expected vs actual, file:line, fix hypothesis, regression test path.
**Note:** "Open question" entries are documented assumptions where the spec is silent. A **Status** line states what is true today; the text under it is the finding as written at the time.

---

## DEF-001 — Square webhook idempotency keys on `paymentId`, not `event.id`

- **Status:** Closed. Square billing was removed (#24, #26). The Noctusoft store webhook (`packages/api/src/routes/webhooks/noctusoft/noctusoftWebhook.ts`) dedupes on the event id through `WebhookEventRepository` before any write; covered by `'dedupes repeated event id'` in `noctusoftWebhook.test.ts`.
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

- **Status:** Closed for the store. `purchase.refunded` updates the payment it names by store payment ref, adding to what was refunded and skipping a refund the admin route already recorded. Admin refunds move money through the store (`POST /payments/:ref/refund`). Tests: `noctusoftWebhook.test.ts` (refund cases), `payments.test.ts`.
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

- **Status:** Closed. The route looks the student up through `studentReader` and refuses a student the caller cannot see; `server.ts` wires it with `StudentRepository`. Test: `packages/api/src/routes/alerts/alerts.idor.test.ts`.
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

- **Status:** Closed. The auth pages show errors through `packages/web/components/common/FormErrorAlert.tsx`, which renders `role="alert"`. Test: `A11Y-007` in `14-a11y-baseline.spec.ts`.
- **Severity:** Sev-2
- **Area:** A11y / WCAG 4.1.3
- **Repro:** Submit `/login` with bad credentials using a screen reader. Error banner appears visually but is not announced.
- **Expected:** `<div role="alert" aria-live="assertive">` so SR users hear the failure immediately.
- **Actual:** Plain `<div data-testid="message-error" className="…red…">`.
- **Files:** `packages/web/app/login/page.tsx:77-81`, `packages/web/app/register/page.tsx:67-71`, plus `forgot-password`, `reset-password` likely identical.
- **Fix hypothesis:** Add `role="alert" aria-live="assertive"` to the error wrapper. Apply same to session-expired and reset-success banners (those should be `aria-live="polite"`).
- **Regression test:** `packages/e2e/tests/14-a11y-baseline.spec.ts` — `A11Y-007` exercises the error path with axe.

## DEF-005 — Test harness coupling: route-level Jest tests duplicate setup boilerplate

- **Status:** Started. `packages/api/src/test-utils/createTestApp.ts` exists; 5 of 161 API test files use it.
- **Severity:** Sev-3 (engineering)
- **Area:** Test infra
- **Repro:** Each route Jest test re-creates `MongoClient`, `Express` app, `authService`, etc. ~50 lines of boilerplate per file. Drift causes subtle differences (e.g., one passes `baseUrl`, another doesn't).
- **Expected:** Shared `createTestApp()` helper.
- **Actual:** Pattern duplicated across `students.test.ts`, `customers.test.ts`, `alerts.test.ts`, etc.
- **Fix hypothesis:** Add `packages/api/src/test-utils/createTestApp.ts`. Out of scope for Phase 4 but called out so future tests don't keep paying the cost.
- **Regression test:** N/A.

## DEF-006 — Color-only severity indicators on alert chips

- **Status:** Closed. `packages/web/components/common/AlertSeverityBadge.tsx` shows an icon and the severity in words; the alerts page uses it. Test: `AlertSeverityBadge.test.tsx`.
- **Severity:** Sev-1
- **Area:** A11y / WCAG 1.4.1, 1.3.1
- **Repro:** View `/dashboard/alerts` with macOS Display → Color Filters → Greyscale.
- **Expected:** Severity (Critical / Warning / Info) discernible without color (icon + text).
- **Actual:** Severity conveyed primarily by ring/background color; visually impossible without color vision.
- **File:** likely `packages/web/components/dashboard/...` alert chip — needs a dedicated audit (UX-A-01 in `UX_REPORT.md`).
- **Fix hypothesis:** Add severity icon + visually-hidden text label.
- **Regression test:** Future axe rule + visual snapshot in greyscale.

## DEF-007 — No `event.id` persistence — webhook replay attacks possible across providers

- **Status:** Closed for Twilio: `twilio-replay-window.middleware.ts` refuses a request older than its window and the route records each event through `WebhookEventRepository`; both have tests. The Noctusoft store webhook records every event id (DEF-001) but has no timestamp window yet.
- **Severity:** Sev-1
- **Area:** Webhooks / replay attacks
- **Repro:** Capture a valid signed Square (or Twilio) webhook body + signature. Replay it 24h later — server still accepts the signature (no time-bound nonce / no event.id store).
- **Expected:** 5-minute (or configurable) timestamp window enforcement + `event.id` dedup table.
- **Actual:** Square: dedup by `payment.id` only (DEF-001). Twilio: signature middleware checks signature only, no replay window.
- **File:** `packages/api/src/routes/webhooks/twilio/twilio-signature.middleware.ts`, `…/square/squareWebhook.ts:79-99`.
- **Fix hypothesis:** Same as DEF-001 — add `webhook_events` collection.
- **Regression test:** Add `replays-after-window-rejected` test in both webhook suites once implemented.

## DEF-008 (open question) — Onboarding wizard state not persisted across refresh

- **Status:** Open. `AddStudentWizard.tsx` keeps its state in memory only.
- **Severity:** Sev-2
- **Area:** UX / Onboarding
- **Repro:** Start `/dashboard` add-student wizard, fill 3 of 5 steps, hard-refresh. All input lost.
- **Expected (per spec §1.1 / RISK-008):** Resume from last completed step.
- **Actual:** Lost.
- **File:** `packages/web/components/dashboard/AddStudentWizard.tsx`.
- **Fix hypothesis:** Persist wizard state to `sessionStorage` keyed by `userId + studentDraftId`; restore on mount.
- **Regression test:** Add to `07-onboarding-wizard.spec.ts` once implemented.

## DEF-009 — Seed route does not reset payments on `force=true` consistently

- **Status:** Closed. Test: `force mode (force=true)` in `packages/api/src/routes/seed/seed.test.ts`.
- **Severity:** Sev-3
- **Area:** Test infra
- **Repro:** Hit `POST /api/seed?force=true` twice. Second run reports `paymentsExisting > 0` instead of recreating.
- **Expected:** With `force=true`, all seeded entities are recreated deterministically.
- **Actual:** Some sections (admins, payments) only delete-and-recreate when `existing.length > 0` — when an unrelated test deleted them, the second seed silently uses prior state. Seed cohorts are decoupled.
- **File:** `packages/api/src/routes/seed/seed.ts:401-432`.
- **Fix hypothesis:** With `force=true`, unconditionally `deleteMany` and recreate every cohort.
- **Regression test:** Add `seed.test.ts` case asserting deterministic counts after two consecutive `force=true` calls.

## DEF-010 (open question) — Admin MFA TOTP window (drift) is undocumented

- **Status:** Decided in code: `window: 2` in `packages/auth/src/MFAService/MFAService.ts` (a code up to 60 seconds old is accepted). `ADMIN-MFA-004` still accepts 200 or 401; tighten it to 200.
- **Severity:** Sev-3
- **Area:** Auth / Admin MFA
- **Repro:** Submit a TOTP from the previous 30s window.
- **Expected:** Spec should pin a window value (default speakeasy `window=1` accepts ±30s; some banks pin to 0 for stricter).
- **Actual:** Test `ADMIN-MFA-004` uses `expect([200, 401])` because behavior is unspecified.
- **File:** `packages/auth/src/MFAService.ts` (drift configuration).
- **Fix hypothesis:** Pin `window: 1` in MFAService and document.
- **Regression test:** `packages/e2e/tests/16-admin-mfa.spec.ts` — `ADMIN-MFA-004`.

---

## November 2026 — found in the status review (25–26 Nov)

Found by checking the live site, the phone app's links, the production logs and the variables set on Railway against the code. Each fix went in with a test that failed first. Paths are under `packages/`.

| ID | Sev | What was wrong | Status | Regression test |
|----|-----|----------------|--------|-----------------|
| DEF-011 | Sev-2 | The live home page offered "Try the demo" in three places and listed demo logins. Production cannot load the demo: its seed routes are closed and its demo sign-in is private. Every button failed. | Fixed, #192. The button shows only where the demo can load (`web/lib/oneClickDemo.ts`). | `web/lib/oneClickDemo.test.ts`, `web/app/page.test.tsx`, `web/app/page.local.test.tsx` |
| DEF-012 | Sev-2 | `/get-app`, `/magic` and the connect panel linked to App Store and Google Play listings that answer 404. | Fixed, #190. The links live in `web/lib/app-downloads.ts`: TestFlight for iPhone, nothing for Android until a listing is live. | `web/lib/app-downloads.test.ts`, `web/app/get-app/page.test.tsx`, `web/app/magic/page.test.tsx` |
| DEF-013 | Sev-2 | The phone's "Update required" screen sent an out-of-date app to the same missing listings, under a button that said "Open the store". | Fixed, #196 (the API sends the links, `api/src/routes/health/health.ts`) and #200 (the button says "Get the update"). | `api/src/routes/health/health.test.ts`, `mobile/src/components/AppErrorBoundary.test.ts` |
| DEF-014 | Sev-2 | The agenda router built its own `AuthService` without the server's token secret. Where `JWT_SECRET` is not in the environment (a local run, a test that passes the secret in config) the agenda answered 401 to tokens every other route accepted, and the web app read that as an expired session. | Fixed, #199. | `api/src/routes/agenda/agendaTokenSecret.test.ts` |
| DEF-015 | Sev-2 | Agenda summaries called the model vendor with a direct key. Model calls go through the relay. | Fixed, #194. Summaries go through the relay and stay off until `AGENDA_AI_ENABLED=true`. | `agents/src/ai/vendor-key-use.test.ts`, `api/src/routes/agenda/agenda.test.ts` |
| DEF-016 | Sev-2 | A device could not be approved from the connector's link: the code was lost at sign-in (issue #3). | Fixed, #195. | `web/app/connector/activate/page.test.tsx`, `web/middleware.test.ts` |
| DEF-017 | Sev-2 | The TestFlight sync script printed the review sign-in password to the terminal, and `testflight.json` held one. | Fixed, #193. The password comes from `DEMO_ACCOUNT_PASSWORD` in the environment and is never printed. | `mobile/src/store/storeMetadata.test.ts` |
| DEF-018 | Sev-2 | The web app sent no HTTPS-only, framing or content-type headers. | Fixed, #191. | `web/lib/securityHeaders.test.ts` |
| DEF-019 | Sev-2 | Production workers ran the dev server instead of the compiled worker. | Fixed, #189. | `workers/src/production-image.test.ts` |
| DEF-020 | Sev-2 | The connect panel drew its QR code through `api.qrserver.com`, so that service received the student id. | Fix: #198 draws the code on the page. It adds a dependency, so a person merges it. | `web/lib/qr/qrPicture.test.ts`, `web/components/dashboard/integrations/ConnectOnPhonePanel.test.tsx` |
| DEF-021 | Sev-2 | On a small phone the floating Feedback button covered "Done connecting" in the Add student wizard and took the tap. | Fixed, #202. Below 768 px Feedback is an entry in the menu and a button on the Support page. | `web/lib/feedback/feedback.test.ts`, `web/components/dashboard/Sidebar.test.tsx`, `web/components/NoctusoftFeedbackWidget.test.tsx` |
| DEF-022 | Sev-2 | The stale-sync email went out again after every worker restart, so each deploy re-sent it to every owner with a stale source. | Fixed, #203. One email per stale spell, recorded in the `sync_staleness_alerts` collection. | `workers/src/sync-staleness-monitor.test.ts` |
| DEF-023 | Sev-3 | Emails and the phone still said Scholaracle: password reset, invoice, manual digest, the default sender name, the admin authenticator label, "Uploading to Scholaracle...". The invoice email defaulted to a sender on scholaracle.com. | Fixed, #204. The browser extension's popup, settings page, tooltip and notification followed in #207, with the API address its settings page suggests. | `api/src/services/PasswordResetEmailSender.test.ts`, `api/src/routes/admin/invoices/invoiceEmail.test.ts`, `api/src/routes/admin/diagnostics/manualDigestEmail.test.ts`, `api/src/sendGridConfig.test.ts`, `browser-extension/src/productName.test.ts` |
| DEF-024 | Sev-4 | The API and the workers logged `API key does not start with "SG."` at every start, because mail goes through the relay with a relay key. | Fixed, #201. | `agents/src/delivery/EmailDelivery/acceptRelayKeys.test.ts` |
| DEF-025 | Sev-2 | Deleting an account did not revoke its Sign in with Apple tokens (App Review 5.1.1(v)). | Code merged, #173. It does nothing until `APPLE_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID` and `APPLE_SIGN_IN_PRIVATE_KEY` are set on the API. | `api/src/routes/account/accountAppleRevocation.test.ts`, `api/src/services/apple/appleTokenRevocation.test.ts` |
| DEF-026 | Sev-2 | Production workers had no `BASE_URL`, so digest and alert emails carried no link to the dashboard. | Fixed on 26 Nov 2026 by setting the variable. `RAILWAY_DEPLOYMENT.md` now lists it as required. | None: it is configuration. |
| DEF-027 | Sev-2 | The site offered alerts by text ("Email and SMS notifications" on the home page, an opt-in and a switch in Settings), and no text was sent. Every sender is built by `agents/src/sms/createSmsStack.ts`, which returns nothing without `NOCTUSOFT_API_KEY`, and the variable was on no service. The key alone would not have been enough: no alert asked for a text. | Fixed on 27 Nov 2026. Alerts go by text to the people who chose text (#228 to #232), and the key is set on the production API and workers. Dev has no key and sends none. `RAILWAY_DEPLOYMENT.md`, "What is sent by text", says who gets which text and how to turn texts off. | `workers/src/alerts-by-text.integration.test.ts`, `agents/src/sms/alertSmsPipeline.integration.test.ts`, `agents/src/sms/createSmsStack.test.ts`, `api/src/services/sms/smsConsentOnSave.test.ts`. None of them sends a text: the relay is replaced. |
| DEF-028 | Sev-1 | `POST /api/auth/login` checked every password it was sent. Nothing counted failed sign-ins and nothing locked an account, for parents and for students. | Fixed, #205. After ten failed sign-ins for one account from one address inside fifteen minutes, or a hundred from one address, the API answers 429 with `Retry-After` and does not check the password. `SIGN_IN_ATTEMPT_LIMIT=off` turns it off. | `api/src/routes/auth/signInAttemptLimit.test.ts`, `api/src/routes/auth/signInAttemptGuard.test.ts`, `auth/src/AttemptLimiter/AttemptLimiter.test.ts` |
| DEF-029 | Sev-2 | A wrong admin authenticator code was not counted and did not use up the sign-in step, at sign-in and at step-up. Someone with an admin's password, or with an admin's session, could try codes until one matched. | Fixed, #205. Five wrong codes per admin inside fifteen minutes, counted across both routes, then 429. | `auth/src/AdminAuthService/adminCodeAttempts.test.ts`, `api/src/routes/admin/auth/codeAttempts.test.ts` |

---

## Summary

| ID | Severity | Domain | Status | Regression test |
|----|----------|--------|--------|-----------------|
| DEF-001 | Sev-1 | Webhook idempotency | Closed | yes |
| DEF-002 | Sev-1 | Refund handling | Closed for the store | yes |
| DEF-003 | Sev-1 | IDOR / multi-tenant | Closed | yes |
| DEF-004 | Sev-2 | A11y | Closed | yes (axe) |
| DEF-005 | Sev-3 | Test infra | Started | n/a |
| DEF-006 | Sev-1 | A11y | Closed | yes |
| DEF-007 | Sev-1 | Webhook replay | Closed for Twilio; store has no timestamp window | yes (Twilio) |
| DEF-008 | Sev-2 | Onboarding UX | Open | no |
| DEF-009 | Sev-3 | Seed determinism | Closed | yes |
| DEF-010 | Sev-3 | MFA window | Decided (`window: 2`); test still tolerant | yes (tolerant) |
| DEF-011 | Sev-2 | Live site: demo | Fixed | yes |
| DEF-012 | Sev-2 | Live site: app links | Fixed | yes |
| DEF-013 | Sev-2 | Phone: update links | Fixed | yes |
| DEF-014 | Sev-2 | Auth: agenda token secret | Fixed | yes |
| DEF-015 | Sev-2 | Model calls | Fixed (off until switched on) | yes |
| DEF-016 | Sev-2 | Device approval | Fixed | yes |
| DEF-017 | Sev-2 | Secrets in output | Fixed | yes |
| DEF-018 | Sev-2 | Web headers | Fixed | yes |
| DEF-019 | Sev-2 | Workers start command | Fixed | yes |
| DEF-020 | Sev-2 | Privacy: QR service | Fix in #198, waits for a person | yes |
| DEF-021 | Sev-2 | Phone width: Feedback button | Fixed | yes |
| DEF-022 | Sev-2 | Email repeats on deploy | Fixed | yes |
| DEF-023 | Sev-3 | Product name in mail and the extension | Fixed | yes |
| DEF-024 | Sev-4 | Log noise | Fixed | yes |
| DEF-025 | Sev-2 | Apple token revocation | Code merged; needs three variables | yes |
| DEF-026 | Sev-2 | Email links | Fixed (configuration) | no |
| DEF-027 | Sev-2 | Text alerts | Fixed (code and configuration) | yes |
| DEF-028 | Sev-1 | Auth: failed sign-ins not limited | Fixed | yes |
| DEF-029 | Sev-2 | Auth: admin code tries not limited | Fixed | yes |
