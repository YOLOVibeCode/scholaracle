---
id: TC-AUTH-008
title: "Session expired redirects to login with reason"
priority: medium
labels: [auth, session, middleware]
suite: auth
---

{traklet:section:objective}
## Objective
Verify that when a session token expires, the user is redirected to login with a session-expired message.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User was previously logged in but token has expired
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login and obtain a session
2. Allow the JWT access token to expire (or manually clear the `auth_token` cookie)
3. Attempt to navigate to `/dashboard`
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- User is redirected to `/login?reason=session_expired`
- Login page displays a "Session expired, please sign in again" message
{/traklet:section:expected-result}
