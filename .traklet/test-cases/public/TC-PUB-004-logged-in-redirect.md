---
id: TC-PUB-004
title: "Logged-in user accessing auth pages redirects to dashboard"
priority: medium
labels: [public, auth, middleware, redirect]
depends: [TC-AUTH-001]
suite: public
---

{traklet:section:objective}
## Objective
Verify that a logged-in user accessing login/register pages is redirected to the dashboard.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is already logged in with valid `auth_token`
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login successfully (TC-AUTH-001)
2. Navigate directly to `/login`
3. Navigate directly to `/register`
4. Navigate directly to `/forgot-password`
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Each auth page redirects to `/dashboard` because middleware detects `auth_token`
- User never sees the login/register forms while authenticated
{/traklet:section:expected-result}
