# Scholaracle UX Heuristic Sweep — Phase 3

**Date:** 2026-04-28
**Scope:** Static review of parent-facing flows in `packages/web/app/` and `packages/web/components/`.
**Method:** Nielsen 10 + WCAG 2.2 AA + Fitts/Hick + state coverage (empty / loading / error / offline / long-string i18n).
**Severity:** Sev-1 (blocker / a11y violation that fails AA) … Sev-4 (polish).

> Read-only review — no running app. Citations are `path:line` for the surface where the gap lives. Fixes are minimal and prescriptive.

---

## Flow 1 — Register (`packages/web/app/register/page.tsx`)

| # | Sev | Heuristic | Finding | File:line | Fix |
|---|-----|-----------|---------|-----------|-----|
| UX-R-01 | Sev-2 | WCAG 1.4.1 (Use of Color) / 4.1.3 (Status Messages) | Error banner is rendered as a plain `<div>` with red background. No `role="alert"` / `aria-live="assertive"`. Screen-reader users won't hear "Passwords do not match". | `register/page.tsx:67-71` | Add `role="alert" aria-live="assertive"` to the error div. |
| UX-R-02 | Sev-2 | Nielsen #5 (Error prevention) | Password rule "min 8 chars" only enforced on submit (`page.tsx:33`). No live strength indicator, no confirm-match indicator. | `register/page.tsx:24-36` | Inline live validation under each input; show pass/fail icon. |
| UX-R-03 | Sev-2 | WCAG 3.3.2 (Labels or Instructions) | `termsConsent` checkbox is `required` but the label includes off-page links; if unchecked the browser-native error fires on a hidden control after the link click trap. No custom error message. | `register/page.tsx:142-163` | Track checked state in React; show explicit error if unchecked on submit. |
| UX-R-04 | Sev-3 | Nielsen #1 (Visibility of system status) | Submit button text changes to "Creating account…" but no spinner / no progress for slow networks (>3s). | `register/page.tsx:187` | Add `<Spinner aria-hidden="true">` + `aria-busy={isLoading}` on form. |
| UX-R-05 | Sev-3 | i18n long-string | `Card max-w-md` will overflow with 50-char names like "María-José O'Sullivan-Smith" + non-breaking labels in non-EN locales. | `register/page.tsx:60` | Use `max-w-md md:max-w-lg`; allow `break-words` on labels. |
| UX-R-06 | Sev-2 | Fitts's Law | The forgotten-password and "Sign in" links are 14px text far below CTA. Tappable area <44px. | `register/page.tsx:190-195` | Wrap in `min-h-[44px] inline-flex items-center` on mobile. |
| UX-R-07 | Sev-2 | A11y — focus management | After error, focus stays on submit button — SR users miss the alert. | `register/page.tsx:65-71` | After `setError`, `useEffect` to focus the alert region. |
| UX-R-08 | Sev-3 | Empty/offline state | No `navigator.onLine` check; submit while offline shows "An error occurred" generic. | `register/page.tsx:51-53` | Detect offline → "You appear to be offline. Try again when connected." |

---

## Flow 2 — Login (`packages/web/app/login/page.tsx`)

| # | Sev | Heuristic | Finding | File:line | Fix |
|---|-----|-----------|---------|-----------|-----|
| UX-L-01 | Sev-2 | WCAG 4.1.3 | Error and session-expired banners lack `role="alert"`/`aria-live`. | `login/page.tsx:61-81` | Add `role="alert" aria-live="polite"` (assertive for error). |
| UX-L-02 | Sev-3 | Nielsen #9 (Help users recognize/recover) | Error message string is whatever the API returns (`result.error`). No mapping to user-friendly copy (e.g., "Account locked — try again in 15 minutes"). | `login/page.tsx:42-43` | Map known error codes to localized strings. |
| UX-L-03 | Sev-3 | Hick's Law | Three nearly-identical CTAs in footer (OAuth row + "Sign up" link + footer Privacy/Terms/Support). Eye fatigue on small viewports. | `login/page.tsx:130-149` | Group OAuth above; collapse footer links to small text. |
| UX-L-04 | Sev-2 | A11y — keyboard | "Remember me" wraps a native checkbox in a `<label>` but the keyboard order on mobile Safari traps because the label and checkbox are siblings. | `login/page.tsx:108-119` | Use `<input id="rememberMe">` + `<label htmlFor="rememberMe">` siblings, not nested. |
| UX-L-05 | Sev-3 | Empty / slow / offline | Suspense fallback shows "Loading…" but no skeleton; flash of empty card on slow 3G. | `login/page.tsx:160-173` | Replace plain text with a skeleton card matching final layout. |
| UX-L-06 | Sev-4 | Nielsen #6 (Recognition over recall) | `redirectTo` query param silently consumed; if redirect path looks suspicious (open redirect risk), there's a check `redirectTo.startsWith('/')` (good), but no visible "After sign-in we'll take you back to X". | `login/page.tsx:39` | Render a small subtitle "You'll return to /dashboard/alerts" when redirect set. |

---

## Flow 3 — Onboarding Wizard (`packages/web/components/dashboard/AddStudentWizard.tsx` + `packages/e2e/tests/07-onboarding-wizard.spec.ts`)

| # | Sev | Heuristic | Finding | Fix |
|---|-----|-----------|---------|-----|
| UX-O-01 | Sev-2 | Nielsen #3 (User control & freedom) | No "save & resume later" — refresh = lose state (RISK-008). | Persist wizard state to `localStorage`/sessionStorage keyed by user id. |
| UX-O-02 | Sev-2 | Nielsen #1 (System status) | No step indicator with completion progress (1 of 5). | Add `<ol>` with `aria-current="step"` on active. |
| UX-O-03 | Sev-3 | A11y — focus order | New step renders at bottom of dialog; focus stays on prev "Next" button. | After step transition, focus the first interactive in new step + `aria-live` announce. |
| UX-O-04 | Sev-3 | i18n long-string | School name input width fixed; 50-char names like "St. Mary's Academy of the Sacred Heart" overflow. | `min-w-0 truncate` on summary review chip, full text on hover. |
| UX-O-05 | Sev-2 | Error state | Validation errors on Back button — user goes back, fixes, no toast confirms fix. | Toast on successful re-validation. |

---

## Flow 4 — Parent Dashboard (`packages/web/app/dashboard/page.tsx` + `components/dashboard/StudentStrip.tsx`)

| # | Sev | Heuristic | Finding | Fix |
|---|-----|-----------|---------|-----|
| UX-D-01 | Sev-1 | WCAG 1.4.3 (Contrast) | Tailwind defaults `text-gray-500` on `bg-gray-50` is ~3.4:1, fails AA for normal text. | Use `text-gray-700` for body, `text-gray-500` only ≥18px. |
| UX-D-02 | Sev-2 | Nielsen #1 | KPI cards mount with `0` then update to real value — no skeleton, looks broken. | Render `<LoadingSkeleton>` while fetching. |
| UX-D-03 | Sev-2 | Empty state | Zero-students dashboard state is implicit; no CTA pointing to onboarding. | Empty state: "Add your first student" CTA card. |
| UX-D-04 | Sev-3 | Color-only signals | Alert severity rendered with red/amber/green ring only. | Add icon + text label ("Critical", "Warning", "Info"). |
| UX-D-05 | Sev-2 | Keyboard nav | StudentStrip horizontal scroller has no keyboard arrow-key handling; mouse-only. | `onKeyDown` for ArrowLeft/Right + `tabindex=0`. |
| UX-D-06 | Sev-3 | Offline | No SW-cached fallback for last-known KPI; offline shows "Network error". | Cache last KPI snapshot in `localStorage`, render with stale-banner. |

---

## Flow 5 — Action Board (`packages/web/app/dashboard/...` + `09-action-board.spec.ts`)

| # | Sev | Heuristic | Finding | Fix |
|---|-----|-----------|---------|-----|
| UX-AB-01 | Sev-2 | Hick's Law | Multiple filter chips + status pills + per-row actions = >9 distinct controls per row; cognitive overload. | Collapse row actions behind a single "⋯" menu. |
| UX-AB-02 | Sev-2 | A11y — semantics | Likely `<div role="row">` instead of native `<tr>`. SR navigation broken. | Use `<table>` with `<thead>`/`<tbody>`. |
| UX-AB-03 | Sev-3 | Drag-and-drop | If reorder is supported, no keyboard-accessible reorder. | `aria-roledescription="sortable"` + arrow-key reorder. |
| UX-AB-04 | Sev-3 | Long-string i18n | Assignment titles like "Capítulo 3 — La revolución industrial y sus consecuencias económicas" wrap unpredictably. | `line-clamp-2` + tooltip with full text. |

---

## Flow 6 — Alerts (`packages/web/app/dashboard/alerts/`)

| # | Sev | Heuristic | Finding | Fix |
|---|-----|-----------|---------|-----|
| UX-A-01 | Sev-1 | WCAG 1.3.1 (Info & relationships) | Severity color (red/yellow/green) likely sole indicator (see UX-D-04). | Add icon + text label, `aria-label` on chip. |
| UX-A-02 | Sev-2 | Nielsen #1 | Acknowledge button gives no confirmation toast; row visually de-emphasizes — easy to think nothing happened. | Toast "Alert acknowledged" + `aria-live` region. |
| UX-A-03 | Sev-2 | Confirmation | Bulk acknowledge has no "Are you sure?" — destructive parity. | `ConfirmDialog` with count. |
| UX-A-04 | Sev-3 | Empty state | "Zero alerts" likely shows blank list. | Friendly empty state with illustration / "All caught up". |

---

## Flow 7 — Settings (`packages/web/app/dashboard/settings/`)

| # | Sev | Heuristic | Finding | Fix |
|---|-----|-----------|---------|-----|
| UX-S-01 | Sev-2 | Nielsen #5 / WCAG 3.3.4 | Threshold input is a free numeric — accepts negative numbers, >100, decimals. | `min=0 max=100 step=1` + live validation. |
| UX-S-02 | Sev-2 | A11y — toggle switches | Switch components likely div-based; need `role="switch" aria-checked`. | Use shadcn `<Switch>` which exposes correct ARIA. |
| UX-S-03 | Sev-3 | Save status | "Save" button — no inline "Saved at HH:MM" confirmation. | Toast + optional auto-save with debounce. |
| UX-S-04 | Sev-3 | Concurrency | No optimistic-concurrency check; two devices = last-write-wins silently (RISK-016). | If-Match header with `updatedAt`; show conflict toast. |

---

## Flow 8 — Billing (`packages/web/app/dashboard/billing/`)

| # | Sev | Heuristic | Finding | Fix |
|---|-----|-----------|---------|-----|
| UX-B-01 | Sev-1 | Money clarity | If trialing, no countdown banner ("Trial ends in 3 days"). | Persistent dismissible banner. |
| UX-B-02 | Sev-1 | A11y — payment iframes | Stripe/Square checkout iframes need `title` attribute; default title is provider-set. | Wrap with `<iframe title="Secure payment form">`. |
| UX-B-03 | Sev-2 | Nielsen #9 (Recover) | After a failed `payment.failed` webhook, dashboard banner is generic; no link to "Update card". | Inline CTA → `/dashboard/billing#payment-method`. |
| UX-B-04 | Sev-2 | Nielsen #5 | Cancel-subscription confirm dialog — does it warn about data retention? | Add "We keep your data 30 days; you can reactivate." copy. |

---

## Cross-cutting findings (all flows)

| # | Sev | Area | Finding | Fix |
|---|-----|------|---------|-----|
| UX-X-01 | Sev-1 | A11y baseline | Zero `axe-core` runs in CI — drift unchecked. | Adopt `@axe-core/playwright` (Phase 4 below). |
| UX-X-02 | Sev-2 | Focus indicators | Tailwind default focus rings replaced in some custom components; check `:focus-visible` everywhere. | Add `focus-visible:ring-2 ring-offset-2` global. |
| UX-X-03 | Sev-2 | Skip links | No "Skip to main content" link in `app/layout.tsx`. | Insert visually-hidden skip link. |
| UX-X-04 | Sev-2 | Reduced-motion | Animations not gated on `prefers-reduced-motion`. | Add `motion-reduce:transition-none` Tailwind variant. |
| UX-X-05 | Sev-3 | Toast singleton | If toasts stack, no max — vertical overflow on mobile. | `Toaster` `expand={false} richColors duration={4000}` and dedupe. |
| UX-X-06 | Sev-2 | Loading skeleton | `LoadingSkeleton` exists (`components/common/LoadingSkeleton.tsx`) but not used in dashboard KPIs/alerts list. | Wire it in. |
| UX-X-07 | Sev-3 | Error boundary | No top-level React error boundary in `app/layout.tsx`. White-screen on unexpected throw. | Add `<ErrorBoundary fallback={…}>`. |
| UX-X-08 | Sev-2 | Console errors | Only `00-critical.spec.ts` checks `console.error`. Silent prod warnings accumulate (RISK-020). | Promote to base fixture. |

---

## Severity totals
- **Sev-1:** 4 (color contrast, color-only signals, billing trial banner, axe baseline)
- **Sev-2:** 18
- **Sev-3:** 12
- **Sev-4:** 1

## Suggested next sprints
1. Fix the 4 Sev-1s — they fail WCAG 2.2 AA outright.
2. Wire `LoadingSkeleton` + empty states (UX-D-02/03, UX-A-04, UX-X-06).
3. Add `role="alert" aria-live` everywhere errors show (UX-R-01, UX-L-01).
4. Adopt @axe-core/playwright (see `NEXT_STEPS.md`).
