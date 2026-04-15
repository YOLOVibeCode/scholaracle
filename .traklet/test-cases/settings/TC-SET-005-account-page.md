---
id: TC-SET-005
title: "Account page - profile summary and password reset"
priority: medium
labels: [settings, account, profile]
depends: [TC-AUTH-001]
suite: settings
---

{traklet:section:objective}
## Objective
Verify the account page shows a read-only profile summary with a link to settings and password reset action.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Account** → `/dashboard/account`
3. Review profile summary (read-only fields)
4. Click **Send Password Reset Email**
5. Click the link to full settings
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Profile fields displayed (name, email, phone) but not directly editable
- "Edit in Settings" link navigates to `/dashboard/settings`
- Password reset sends email via authApi.requestPasswordReset
- Success message confirms email was sent
{/traklet:section:expected-result}
