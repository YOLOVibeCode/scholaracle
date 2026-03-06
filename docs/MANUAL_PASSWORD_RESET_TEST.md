# Manual password reset test

Use this to verify the password reset flow in the browser.

## Production (Railway)

For password reset emails to contain a valid link in production, the **API** service must have:

- **BASE_URL** = `https://scholarmancy.com` (or your web app URL)

Set it in Railway: Project → API service → Variables → Add `BASE_URL` = `https://scholarmancy.com`. Without this, reset links point to `http://localhost:2800` and will not work.

## Prerequisites

- App running: `pnpm dev` (Web on **2800**, API on **2801** per PORT_POLICY).
- If you use different ports, replace below: Web = your app URL, API = your API base (e.g. `http://localhost:2801`).

## Test 1: Public “Forgot password” page

1. Open **http://localhost:2800/forgot-password** (or your web URL).
2. Enter a known user email, e.g. **test.parent@example.com** (from seed).
3. Click **Submit** (or the submit button).
4. **Expect:** Green success message: “If an account exists for that email, we've sent a password reset link. Check your inbox.”
5. Optional: Click “Back to login” and confirm you land on `/login`.

## Test 2: Dashboard Account page (send reset from profile)

1. Log in as a parent: **http://localhost:2800/login**  
   - Email: **test.parent@example.com**  
   - Password: **TestPass123!**
2. Go to **Account**: sidebar “Account” or **http://localhost:2800/dashboard/account**.
3. In the **Password** card, click **“Send password reset email”**.
4. **Expect:** Green message: “Check your inbox at test.parent@example.com. Click the link in the email to set a new password.”
5. Optional: Click “Open Settings” and confirm you land on `/dashboard/settings`.

## Test 3: Reset password with token (after email)

The reset link in the email looks like:  
`http://localhost:2800/reset-password?token=...`

- In local dev, the “email” is often logged by the API or sent to MailHog (e.g. **http://localhost:2804** if using Docker).
- Open that link (or copy token from logs/MailHog), enter a **new password** twice, submit.
- **Expect:** Success and redirect to login; log in with the new password.

## Quick E2E (forgot password only)

With no other dev server using 2800/2801:

```bash
cd packages/e2e && pnpm exec playwright test tests/auth/forgot-password.spec.ts
```

This starts Web + API, runs FORGOT-001–004, then shuts down.
