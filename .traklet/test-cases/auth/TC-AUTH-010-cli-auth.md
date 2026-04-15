---
id: TC-AUTH-010
title: "CLI auth device code approval"
priority: low
labels: [auth, cli]
suite: auth
---

{traklet:section:objective}
## Objective
Verify a user can approve a CLI device code to authorize the Scholaracle CLI.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in (has valid auth token)
- A CLI device code has been generated (e.g. via `scholaracle login`)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/cli-auth` (public URL)
2. If not logged in, click "Sign in" and authenticate first
3. Enter or confirm the device code displayed by the CLI
4. Click **Approve**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- POST to `/auth/cli/approve` succeeds
- CLI receives the token and can make authenticated API calls
- Page shows success confirmation
- Deny button also works: POST to `/auth/cli/deny` rejects the code
{/traklet:section:expected-result}
