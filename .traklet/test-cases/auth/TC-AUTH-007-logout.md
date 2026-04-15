---
id: TC-AUTH-007
title: "Logout from dashboard"
priority: critical
labels: [auth, logout, smoke]
depends: [TC-AUTH-001]
suite: auth
---

{traklet:section:objective}
## Objective
Verify a logged-in user can sign out and is redirected to the login page.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in and on any `/dashboard/*` page
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login per TC-AUTH-001 → arrive at `/dashboard`
2. Click the **Logout** button in the dashboard header
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- User is redirected to `/login`
- `auth_token` cookie is cleared
- localStorage tokens are removed
- Navigating to `/dashboard` redirects back to `/login`
{/traklet:section:expected-result}
