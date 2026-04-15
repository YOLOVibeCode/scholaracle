---
id: TC-AUTH-005
title: "Request password reset"
priority: high
labels: [auth, password-reset]
suite: auth
---

{traklet:section:objective}
## Objective
Verify the forgot-password flow sends a reset email and shows confirmation.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- A registered user account exists
- User is not logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/forgot-password`
2. Enter the registered email address
3. Click **Send Reset Link**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Success message is displayed: "Check your email for a reset link"
- A password reset email is sent to the provided address
- The email contains a link with a valid `?token=` parameter pointing to `/reset-password`
{/traklet:section:expected-result}
