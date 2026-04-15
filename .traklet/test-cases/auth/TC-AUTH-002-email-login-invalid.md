---
id: TC-AUTH-002
title: "Login with invalid credentials shows error"
priority: high
labels: [auth, login, negative]
depends: []
suite: auth
---

{traklet:section:objective}
## Objective
Verify the login form rejects invalid credentials with a clear error message.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is not currently logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/login`
2. Enter a valid email address
3. Enter an incorrect password
4. Click **Sign In**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- User remains on `/login`
- An error message is displayed (e.g., "Invalid email or password")
- No `auth_token` cookie is set
- Password field is cleared
{/traklet:section:expected-result}
