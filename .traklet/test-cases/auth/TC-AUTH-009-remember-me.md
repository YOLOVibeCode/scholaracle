---
id: TC-AUTH-009
title: "Remember me extends session duration"
priority: medium
labels: [auth, login, session]
suite: auth
---

{traklet:section:objective}
## Objective
Verify the "Remember me" checkbox on login controls refresh token duration.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- A registered user account exists
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/login`
2. Enter valid credentials
3. Check the **Remember me** checkbox
4. Click **Sign In**
5. Verify session persists after closing and reopening the browser
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- With "Remember me" checked: refresh token lasts per REFRESH_TOKEN_EXPIRES_IN (e.g. 30d)
- Without "Remember me": refresh token lasts per SESSION_REFRESH_TOKEN_EXPIRES_IN (e.g. 24h)
- In both cases, user arrives at `/dashboard`
{/traklet:section:expected-result}
