# CLI Authentication Fix — Detailed Steps

## Problem Statement

The CLI device authorization flow was **completely broken** in production. Scripts like `force-digest.ts` could not authenticate because the web-based approval page was unreachable. Device codes expired after 15 minutes with no way to approve them.

---

## Root Cause Analysis

Three bugs chained together to make the flow unusable:

### Bug 1: Middleware Blocked `/cli-auth` (Critical)

**File:** `packages/web/middleware.ts`

The Next.js middleware enforces authentication on all routes not listed in `publicRoutes`. The `/cli-auth` page was **not** in that list, so any unauthenticated user visiting it got a `307 Redirect → /login` before the page could ever render.

The irony: the `/cli-auth` page already had a graceful "Sign In first" UI with a button — but nobody could see it because the middleware intercepted the request upstream.

```
Browser → GET /cli-auth
       → middleware sees no auth_token cookie
       → 307 redirect to /login
       → User never sees the page
       → Device code expires
```

### Bug 2: Login Page Ignored `?redirect=` Parameter

**File:** `packages/web/app/login/page.tsx`

Even if a user manually navigated to `/login?redirect=/cli-auth`, the login handler always pushed to `/dashboard` on success (line 38: `router.push('/dashboard')`). The `redirect` query parameter was never read or used.

This meant:
1. CLI opens browser to `/cli-auth?code=XXXX-1234`
2. Middleware redirects to `/login`
3. User logs in successfully
4. Login page sends them to `/dashboard`
5. User has no idea where `/cli-auth` is
6. Code expires

### Bug 3: No Automated CLI Path

**File:** `packages/workers/src/scripts/cli-auth.ts`

The only authentication method was the device flow (browser-based). There was no way to pass credentials directly for automated/scripted use. Every invocation required:
- A human to open a browser
- Navigate to the approval page
- Type in a 9-character code
- Click Approve

This made CI/CD and local automation impossible.

---

## Fixes Applied

### Fix 1: Add `/cli-auth` to Public Routes

**File:** `packages/web/middleware.ts`
**Commit:** `50fda11`

Added `'/cli-auth'` to the `publicRoutes` array so the middleware allows unauthenticated access. The page handles its own auth state:
- **Logged in:** Shows code input form with Approve/Deny buttons
- **Not logged in:** Shows "Sign In" button that redirects to `/login?redirect=/cli-auth`

```typescript
const publicRoutes = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/admin/login',
  '/privacy',
  '/terms',
  '/support',
  '/pricing',
  '/cli-auth',  // ← Added
];
```

### Fix 2: Login Page Respects `?redirect=` Parameter

**File:** `packages/web/app/login/page.tsx`
**Commit:** `50fda11`

Read the `redirect` search parameter and navigate there after successful login instead of hardcoding `/dashboard`. Validates that the redirect starts with `/` to prevent open-redirect attacks.

```typescript
const redirectTo = searchParams.get('redirect');

// On successful login:
const dest = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/dashboard';
router.push(dest);
```

### Fix 3: Pre-fill Code via `?code=` Query Parameter

**File:** `packages/web/app/cli-auth/page.tsx`
**Commit:** `50fda11`

- Reads `?code=XXXX-1234` from the URL and pre-fills the input field
- Wrapped component in `<Suspense>` (required by Next.js for `useSearchParams`)
- Preserves the code through the login redirect flow:
  - `/cli-auth?code=XXXX-1234` → not logged in → Sign In button
  - → `/login?redirect=/cli-auth?code=XXXX-1234` → user logs in
  - → `/cli-auth?code=XXXX-1234` → code is pre-filled, user just clicks Approve

### Fix 4: API Includes Code in Verification URL

**File:** `packages/api/src/routes/auth/cli-auth.ts`
**Commit:** `50fda11`

The API now appends the user code to the verification URL so the browser opens with the code already in the page:

```typescript
// Before:
const verificationUrl = `${baseUrl}/cli-auth`;

// After:
const verificationUrl = `${baseUrl}/cli-auth?code=${userCode}`;
```

### Fix 5: Direct Login for Automated CLI Usage

**File:** `packages/workers/src/scripts/cli-auth.ts`
**Commit:** `50fda11`

Added a direct login path that bypasses the device flow entirely. The `getCliToken()` function now:

1. Checks `~/.scholaracle/cli-token.json` for a cached (non-expired) token
2. Checks for credentials via env vars (`SCHOLARACLE_EMAIL`, `SCHOLARACLE_PASSWORD`) or CLI flags (`--email=`, `--password=`)
3. If credentials found: calls `/api/auth/login` directly, caches the token, returns it
4. If no credentials: falls back to the device flow (browser-based)

```typescript
// Automated usage (no browser):
SCHOLARACLE_EMAIL=user@example.com SCHOLARACLE_PASSWORD=pass123 \
  npx ts-node --transpile-only src/scripts/force-digest.ts \
  --studentId=69a4f1b53671c632ca591c7f

// Or with flags:
npx ts-node --transpile-only src/scripts/force-digest.ts \
  --studentId=69a4f1b53671c632ca591c7f \
  --email=user@example.com \
  --password=pass123

// Interactive usage (opens browser):
npx ts-node --transpile-only src/scripts/force-digest.ts \
  --studentId=69a4f1b53671c632ca591c7f
```

---

## User Flow — Before vs After

### Before (Broken)

```
CLI prints code CGSJ-1450
  → opens scholarmancy.com/cli-auth
  → 307 redirect to /login (middleware blocks)
  → user logs in
  → lands on /dashboard (redirect ignored)
  → user can't find /cli-auth
  → code expires after 15 minutes
  → script throws "Authorization code expired"
```

### After — Interactive Path

```
CLI prints code CGSJ-1450
  → opens scholarmancy.com/cli-auth?code=CGSJ-1450
  → page loads (public route now)
  → if not logged in: "Sign In" button → /login?redirect=/cli-auth?code=CGSJ-1450
  → user logs in → redirected back to /cli-auth?code=CGSJ-1450
  → code is pre-filled in input
  → user clicks "Approve"
  → CLI receives token, caches it
  → script continues
```

### After — Automated Path

```
SCHOLARACLE_EMAIL + SCHOLARACLE_PASSWORD set
  → getCliToken() detects credentials
  → POST /api/auth/login with email/password
  → receives JWT token
  → caches at ~/.scholaracle/cli-token.json
  → script continues (no browser needed)
```

---

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `packages/web/middleware.ts` | Added `/cli-auth` to `publicRoutes` | +1 |
| `packages/web/app/login/page.tsx` | Read `?redirect=` param, use it on login success | +3 |
| `packages/web/app/cli-auth/page.tsx` | Read `?code=` param, Suspense wrapper, preserve code through login | +15, -8 |
| `packages/web/app/register/page.tsx` | Minor SMS consent copy edit | +2, -2 |
| `packages/api/src/routes/auth/cli-auth.ts` | Include code in verification URL | +1, -1 |
| `packages/workers/src/scripts/cli-auth.ts` | Add direct login mode (env vars + flags) | +47, -9 |

**Total:** 6 files, +77 insertions, -20 deletions

---

## Token Caching

Both auth paths cache the JWT at `~/.scholaracle/cli-token.json` with `0600` permissions. Subsequent script runs reuse the cached token until it expires (checked by decoding the JWT `exp` claim). No re-authentication needed until expiry.

---

## Deployment

- **Commit:** `50fda11` on `main`
- **API + Workers:** Auto-deployed via Railway
- **Web Frontend:** Auto-deployed via Vercel
- **Verification:** `curl -sI https://scholarmancy.com/cli-auth` returns `HTTP/2 200` (was `307` before fix)
