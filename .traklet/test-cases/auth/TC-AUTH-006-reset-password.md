---
id: TC-AUTH-006
title: "Reset password via token link"
priority: high
labels: [auth, password-reset]
depends: [TC-AUTH-005]
suite: auth
---

{traklet:section:objective}
## Objective
Verify a user can set a new password using the reset token from their email.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- A valid password reset token exists (from TC-AUTH-005)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/reset-password?token=<valid-token>`
2. Enter a new password
3. Confirm the new password
4. Click **Reset Password**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Success message is displayed
- User is redirected to `/login?reset=success`
- Login page shows a success banner "Password reset successfully"
- User can log in with the new password
{/traklet:section:expected-result}
