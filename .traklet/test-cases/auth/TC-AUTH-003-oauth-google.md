---
id: TC-AUTH-003
title: "Login via Google OAuth"
priority: high
labels: [auth, oauth, google]
suite: auth
---

{traklet:section:objective}
## Objective
Verify a user can authenticate via Google OAuth and land on the dashboard.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` env vars are configured
- Google OAuth provider button is visible on login page
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/login`
2. Click the **Continue with Google** button (OAuthButtons component)
3. Complete Google's OAuth consent flow
4. Authorize the application
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- User is redirected to `/dashboard`
- NextAuth session is established; Providers component syncs tokens to apiClient/cookie
- If first-time OAuth user, account is created automatically
- If returning OAuth user, existing account is linked
{/traklet:section:expected-result}
