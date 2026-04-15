---
id: TC-AUTH-011
title: "Middleware blocks unauthenticated access to protected routes"
priority: critical
labels: [auth, middleware, security, smoke]
suite: auth
---

{traklet:section:objective}
## Objective
Verify that accessing any protected route without a valid session redirects to `/login`.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is not logged in (no `auth_token` cookie)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Clear all cookies and localStorage
2. Attempt to navigate directly to each protected URL:
   - `/dashboard`
   - `/dashboard/students`
   - `/dashboard/settings`
   - `/dashboard/billing`
   - `/dashboard/alerts`
   - `/connector/activate`
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Each URL redirects to `/login`
- No dashboard content is visible
- Public routes (`/`, `/login`, `/register`, `/pricing`, `/privacy`, `/terms`, `/support`) remain accessible without auth
{/traklet:section:expected-result}
