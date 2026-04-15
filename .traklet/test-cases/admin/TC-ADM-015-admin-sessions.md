---
id: TC-ADM-015
title: "Admin sessions - view and revoke own sessions"
priority: low
labels: [admin, sessions, security]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify admin can view and revoke their own sessions from the admin sessions page.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to `/admin/sessions`
2. Review active sessions list (SessionCard components)
3. Revoke an individual session
4. Revoke all other sessions
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- SessionCard shows device, IP, last active, current session indicator
- Revoking a session invalidates it
- "Revoke All Other" keeps only the current session
- Data from adminSessionsApi
{/traklet:section:expected-result}
