---
id: TC-SET-002
title: "Settings - unlink OAuth provider"
priority: medium
labels: [settings, oauth, unlink]
depends: [TC-SET-001]
suite: settings
---

{traklet:section:objective}
## Objective
Verify a user can unlink a connected OAuth provider (Google, Apple, Azure AD) from their account.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with an OAuth provider linked
- User also has email/password auth (so they don't lock themselves out)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/settings`
2. Scroll to the linked accounts / OAuth section
3. Click **Unlink** next to the linked provider (e.g., Google)
4. Confirm the unlink action
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- settingsApi.unlink is called for the provider
- Provider is removed from linked accounts list
- User can no longer sign in with that OAuth provider
- If no other auth method exists, unlink should be prevented with warning
{/traklet:section:expected-result}
